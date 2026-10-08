import { DateTime } from "luxon";
import { AppError } from "./errors.js";
import { getTimeInMs, getNextBookingDate, processFileLineByLine, sleep, TIME_ZONE, getSession } from "./utils.js";
import { NtfyVendor } from "./notifications/vendors/ntfy.js";
import { BookingResult } from "./api/interfaces.js";
import { API } from "./api/index.js";

const BOOKING_SLOTS = ["18:00", "18:30"] as const; // We want to book a slot for 18:00 and 18:30
const ATTEMPT_TIMES = [
    ["18:00", "18:30"], // Out of DST (Winter)
    ["19:00", "19:30"], // In DST (Summer)
] as const;
const PREPARE_AHEAD_MS = 5 * 60 * 1000;
const RETRY_INTERVAL_MS = 250;
const MAX_RETRY_DURATION_MS = 1_500; // only attempt for 1.5 seconds
const notif = new NtfyVendor();

async function retryBooking(book: () => Promise<BookingResult>): Promise<BookingResult> {
    let attempt = 0;
    const retryStartedAt = Date.now();

    while (true) {
        const nextAttemptAt = retryStartedAt + attempt * RETRY_INTERVAL_MS;
        const waitMs = nextAttemptAt - Date.now();

        if (waitMs > 0) {
            await sleep(waitMs);
        }

        const elapsed = Date.now() - retryStartedAt;
        if (elapsed >= MAX_RETRY_DURATION_MS) {
            return {
                success: false,
                title: "Session Not Booked",
                message:
                    `Octiv did not accept the booking within ` +
                    `${MAX_RETRY_DURATION_MS / 1000} seconds.`,
            };
        }

        attempt++;
        console.log(
            `Booking attempt #${attempt} at ${DateTime.now()
                .setZone(TIME_ZONE)
                .toFormat("yyyy-MM-dd HH:mm:ss.SSS ZZZZ")}`,
        );

        const result = await book();
        if (result.success) {
            return result;
        }
        
        console.log(
            `Booking attempt #${attempt} rejected: ${result.message}`,
        );
    }
}

async function bookSlot(slotTime: string, attemptTime: string): Promise<BookingResult> {
    const user = await API.Login();
    const me = await API.GetMe(user.accessToken);

    const schedule = await API.GetSchedule(user.accessToken);
    const session = getSession(schedule, slotTime);

    // Wait until the actual booking attempt time.
    const targetTimeInMs = getTimeInMs(attemptTime);
    const nowInMs = DateTime.now().setZone(TIME_ZONE).toMillis();
    
    const diff = targetTimeInMs - nowInMs;

    if (diff < 0) {
        return {
            success: false,
            title: "Booking Missed",
            message: `Missed booking window for ${session.date}, ${session.startTime} by ${Math.abs(diff)}ms.`,
        };
    }

    if (diff > 0) {
        console.log(`Waiting ${diff}ms before slot opens up...`);
        await sleep(diff);
    }
    
    return await retryBooking(async () => {
        const bookData = await API.Book(user.accessToken, session, me.id);
        if (!("message" in bookData)) {
            return {
                success: true,
                title: "Session Booked",
                message:
                    "You have successfully booked your session for " +
                    `${session.date}, ${session.startTime}.\n\n` +
                    "Happy lifting!",
            }
        }

        return {
            success: false,
            title: "Session Not Booked",
            message:
                "Booking for " +
                `${session.date}, ${session.startTime}` +
                "was rejected.\n\n" +
                `Reason: ${bookData.message}`
        };
    });
}

async function scheduler() {
    console.log(`Scheduler started. Time zone ${TIME_ZONE}.`);

    while (true) {
        let now = DateTime.now().setZone(TIME_ZONE);

        // Saturday/Sunday
        if (now.weekday > 5) {
            const daysUntilMonday = 8 - now.weekday;

            const nextMonday = now
                .plus({ days: daysUntilMonday })
                .startOf("day");

            const waitMs = nextMonday.toMillis() - now.toMillis();

            console.log(`Weekend. Sleeping until ${nextMonday.toFormat("yyyy-MM-dd HH:mm:ss ZZZZ")}`);

            await sleep(waitMs);
            continue;
        }
        
        /*
         * Determine the actual date we're trying to book.
         * This is always 14 calendar days from today.
         */
        const bookingDate = getNextBookingDate();

        /*
         * Skip the entire booking cycle if this date is listed.
         * Both 18:00 and 18:30 are skipped together.
         */
        const shouldSkip = await processFileLineByLine("./skip-dates.txt", (date) => date === bookingDate);

        if (shouldSkip) {
            console.log(
                `Booking date ${bookingDate} is listed in ` +
                `"skip-dates.txt"; skipping today's booking cycle.`,
            );
            
            await notif.send(
                "Booking Skipped",
                `Booking for ${bookingDate} was skipped.`,
            );

            now = DateTime.now().setZone(TIME_ZONE);
            const tomorrow = now
                .plus({ days: 1 })
                .startOf("day");
            const waitMs = tomorrow.toMillis() - now.toMillis();
            
            await sleep(waitMs);
            continue;
        }

        /*
         * The session we're booking is ALWAYS 18:00 / 18:30.
         *
         * The time at which we attempt the booking changes with DST:
         *
         * Winter: 18:00 / 18:30 (out DST)
         * Summer: 19:00 / 19:30 (in DST)
         */
        const attemptIdx = now.isInDST ? 1 : 0;

        for (let i = 0; i < BOOKING_SLOTS.length; i++) {
            const slotTime = BOOKING_SLOTS[i];
            const attemptTime = ATTEMPT_TIMES[attemptIdx][i];

            // Recalculate the current time before every slot.
            now = DateTime.now().setZone(TIME_ZONE);

            const [hour, minute] = attemptTime.split(":").map(Number);

            const target = now.startOf("day").set({
                hour,
                minute,
                second: 0,
                millisecond: 0,
            });

            // This slot has already passed.
            if (target <= now) {
                continue;
            }

            const prepareAt = target.minus({
                milliseconds: PREPARE_AHEAD_MS,
            });

            const waitMs = prepareAt.toMillis() - now.toMillis();

            console.log(`Date/slot to book: ${bookingDate}, ${slotTime}`);
            console.log(`Preparing to book at: ${prepareAt.toFormat("yyyy-MM-dd HH:mm:ss.SSS ZZZZ")}`);
            console.log(`Attemping the booking at: ${target.toFormat("yyyy-MM-dd HH:mm:ss.SSS ZZZZ")}`);

            if (waitMs > 0) {
                await sleep(waitMs);
            }

            try {
                const result = await bookSlot(slotTime, attemptTime);
                await notif.send(result.title, result.message);
            } catch (error) {
                console.error(`Booking ${bookingDate}, ${slotTime} failed unexpectedly:`, error);

                await notif.send(
                    "Booking Error",
                    error instanceof Error
                        ? error.message
                        : String(error),
                );
            }
        }

        // We've processed today's slots.
        // Sleep until tomorrow instead of spinning in a tight loop.
        now = DateTime.now().setZone(TIME_ZONE);

        const tomorrow = now
            .plus({ days: 1 })
            .startOf("day");

        const waitMs = tomorrow.toMillis() - now.toMillis();

        console.log(`Today's slots processed. Sleeping until ${tomorrow.toFormat("yyyy-MM-dd HH:mm:ss ZZZZ")}`);

        await sleep(waitMs);
    }
}

scheduler().catch((e) => {
    if (e instanceof AppError) {
        console.error(e.name, e.toJSON());
    } else {
        console.error(e);
    }

    process.exit(1);
});