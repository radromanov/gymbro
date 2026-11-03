import { DateTime } from "luxon";
import { AppError } from "./errors.js";
import {
    processFileLineByLine,
    sleep,
    TIME_ZONE,
    getSession,
} from "./utils.js";
import { NtfyVendor } from "./notifications/vendors/ntfy.js";
import { BookingResult } from "./api/interfaces.js";
import { API } from "./api/index.js";
import { retryBooking, runBookingCycle, sleepUntilTomorrow } from "./core.js";

const notif = new NtfyVendor();

async function prepareBooking(
    slotTime: string,
    bookingDate: string,
): Promise<() => Promise<BookingResult>> {
    console.log(`Preparing ${slotTime} for ${bookingDate}`);

    const user = await API.Login();
    const me = await API.GetMe(user.accessToken);
    const schedule = await API.GetSchedule(user.accessToken);
    const session = getSession(schedule, slotTime);

    // This closure is not invoked until the scheduler reaches the
    // calculated attempt time.
    return async () =>
        retryBooking(
            async () => {
                const bookData = await API.Book(
                    user.accessToken,
                    session,
                    me.id,
                );

                if (!("message" in bookData)) {
                    return {
                        success: true,
                        title: "Session Booked",
                        message: `Successfully booked ${session.date}, ${session.startTime}.`,
                    };
                }

                return {
                    success: false,
                    title: "Session Not Booked",
                    message:
                        `Booking for ${session.date}, ${session.startTime} was rejected. ` +
                        `Reason: ${bookData.message}`,
                };
            },
            {
                nowMs: Date.now,
                sleep,
                intervalMs: 250,
                maxDurationMs: 1_500,
                log: console.log,
            },
        );
}

async function scheduler(): Promise<never> {
    console.log(`Scheduler started. Time zone ${TIME_ZONE}.`);

    while (true) {
        const result = await runBookingCycle({
            now: () => DateTime.now().setZone(TIME_ZONE),
            sleep,
            isSkipped: (bookingDate) =>
                processFileLineByLine(
                    "./skip-dates.txt",
                    (date) => date === bookingDate,
                ),
            prepareBooking,
            notify: (title, message) => notif.send(title, message),
        });

        // The weekend branch already slept until Monday.
        if (result.kind === "weekend") {
            continue;
        }

        // Processed and skipped cycles both resume tomorrow.
        await sleepUntilTomorrow(DateTime.now().setZone(TIME_ZONE), sleep);
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
