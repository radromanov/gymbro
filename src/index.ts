import { DateTime } from "luxon";
import { API } from "./api/index.js";
import { AppError } from "./errors.js";
import { getTimeInMs, getNextBookingDate, processFileLineByLine, sleep, TIME_ZONE, getSession } from "./utils.js";
import { NtfyVendor } from "./notifications/vendors/ntfy.js";

const WINTER_SLOTS = ["18:00", "18:30"] as const;
const SUMMER_SLOTS = ["19:00", "19:30"] as const;
const PREPARE_AHEAD_MS = 5 * 60 * 1000;
const notif = new NtfyVendor();

async function bookSlot(timeSlot: string) {
    // Load `skip-dates.txt` first
    // If NEXT is in `skip-dates.txt`, abort
    const next = getNextBookingDate();
    const skip = await processFileLineByLine("./skip-dates.txt", (s) => s === next);
    if (skip) {
        console.log(`Next date (${next}) is part of the "skip-dates.txt" file; aborting process...`)
        return;
    }

    // CRON job will have to install dependencies - it starts 5 minutes early
    // Once this script runs, login and get schedule
    const user = await API.Login();
    const me = await API.GetMe(user.accessToken);

    const schedule = await API.GetSchedule(user.accessToken);
    const session = getSession(schedule, timeSlot);

    // Determine if we need to wait until the provided `timeSlot`
    const targetTimeInMs = getTimeInMs(timeSlot);
    const nowInMs = DateTime.now().setZone(TIME_ZONE).toMillis();
    
    const diff = targetTimeInMs - nowInMs;
    if (diff < 0) {
        throw new AppError(
            `Missed booking window for ${timeSlot} by ${Math.abs(diff)}ms`
        );
    }

    if (diff > 0) {
        console.log(`Waiting ${diff}ms before slot opens up...`);

        await notif.send(
            "Session Booking Queued",
            `Automated booking for ${session.date}, ${session.startTime} is queued.`,
        );

        await sleep(diff);
    }

    console.log(
        `Booking ${timeSlot} at ${DateTime.now()
            .setZone(TIME_ZONE)
            .toFormat("yyyy-MM-dd HH:mm:ss.SSS ZZZZ")}`,
    );
    
    // Book here
    const bookData = await API.Book(user.accessToken, session, me.id);
    
    // Notifications
    if ("message" in bookData) {
        await notif.send(
            "Session Not Booked",
            `Automated booking for ${session.date}, ${session.startTime} failed.\n\n${bookData.message}`,
        );
    } else {
        await notif.send(
            "Session Booked",
            `You have successfully booked your session for ${session.date}, ${session.startTime}.\n\nHappy lifting!`
        );
    }
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

            console.log(
                `Weekend. Sleeping until ${nextMonday.toFormat(
                    "yyyy-MM-dd HH:mm:ss ZZZZ",
                )}`,
            );

            await sleep(waitMs);
            continue;
        }

        const slotsToBook = now.isInDST
            ? SUMMER_SLOTS
            : WINTER_SLOTS;

        for (const slot of slotsToBook) {
            // Recalculate the current time before every slot.
            now = DateTime.now().setZone(TIME_ZONE);

            const [hour, minute] = slot.split(":").map(Number);

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

            console.log(
                `Next booking: ${target.toFormat(
                    "yyyy-MM-dd HH:mm:ss.SSS ZZZZ",
                )}`,
            );

            console.log(
                `Preparing at: ${prepareAt.toFormat(
                    "yyyy-MM-dd HH:mm:ss.SSS ZZZZ",
                )}`,
            );

            if (waitMs > 0) {
                await sleep(waitMs);
            }

            const actualSlot = target.toFormat("HH:mm");

            try {
                await bookSlot(actualSlot);
            } catch (error) {
                console.error(
                    `Booking ${actualSlot} failed:`,
                    error,
                );

                try {
                    await notif.send(
                        "Booking Error",
                        `Automated booking for ${actualSlot} failed unexpectedly.\n\n${error instanceof Error ? error.message : String(error)}`,
                    );
                } catch (notificationError) {
                    console.error(
                        "Failed to send error notification:",
                        notificationError,
                    );
                }
            }
        }

        // We've processed today's slots.
        // Sleep until tomorrow instead of spinning in a tight loop.
        now = DateTime.now().setZone(TIME_ZONE);

        const tomorrow = now
            .plus({ days: 1 })
            .startOf("day");

        const waitMs = tomorrow.toMillis() - now.toMillis();

        console.log(
            `Today's slots processed. Sleeping until ${tomorrow.toFormat(
                "yyyy-MM-dd HH:mm:ss ZZZZ",
            )}`,
        );

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