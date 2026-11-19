import { DateTime } from "luxon";
import { AppError, SessionError } from "./errors.js";
import {
    processFileLineByLine,
    sleep,
    TIME_ZONE,
    getSession,
} from "./utils.js";
import { NtfyVendor } from "./notifications/vendors/ntfy.js";
import { API } from "./api/index.js";
import {
    retryBooking,
    runBookingCycle,
    sleepUntilTomorrow,
    RETRY_DURATION_MS,
    RETRY_INTERVAL_MS,
    type BookingResult,
} from "./core.js";
import { skipEntryMatches } from "./skip-dates.js";
import { logger } from "./logger.js";

const notif = new NtfyVendor();

async function prepareBooking(
    slotTime: string,
    bookingDate: string,
): Promise<() => Promise<BookingResult>> {
    const label = `${bookingDate} ${slotTime}`;
    const user = await API.Login();
    const me = await API.GetMe(user.accessToken);
    const schedule = await API.GetSchedule(user.accessToken);
    const session = getSession(schedule, slotTime);

    // getSession() picks by position; confirm it is really the requested class.
    const expectedDate = DateTime.fromFormat(bookingDate, "dd-MM-yyyy").toISODate();
    if (
        !session ||
        session.date !== expectedDate ||
        session.startTime?.slice(0, 5) !== slotTime
    ) {
        throw new SessionError(
            `schedule returned ${session ? `${session.date} ${session.startTime}` : "no session"} ` +
                `instead of ${expectedDate} ${slotTime}`,
        );
    }

    // This closure is not invoked until the scheduler reaches the
    // calculated attempt time.
    return async () => {
        const result = await retryBooking(
            async (): Promise<BookingResult> => {
                const bookData = await API.Book(
                    user.accessToken,
                    session,
                    me.id,
                );

                if ("message" in bookData) {
                    // Rejection (e.g. booking window not open yet): retry.
                    return {
                        success: false,
                        title: "Session Not Booked",
                        message: bookData.message,
                    };
                }

                const status = bookData.status?.name;
                if (status === "BOOKED") {
                    return {
                        success: true,
                        title: "Session Booked",
                        message: `Booked ${label}.`,
                    };
                }

                // Never re-POST once the API has accepted the request in some
                // other state; a retry could create duplicate entries.
                if (status === "WAITING") {
                    return {
                        success: false,
                        retryable: false,
                        title: "Waiting List",
                        message: `${label} is taken; placed on the waiting list.`,
                    };
                }

                return {
                    success: false,
                    retryable: false,
                    title: "Booking Unconfirmed",
                    message: `${label}: unexpected booking status "${String(status)}"; check the app.`,
                };
            },
            {
                nowMs: Date.now,
                sleep,
                intervalMs: RETRY_INTERVAL_MS,
                maxDurationMs: RETRY_DURATION_MS,
                log: (message) => logger.info(`Slot ${slotTime}: ${message}`),
            },
        );

        // A retry deadline result carries no date/slot; add it for the push.
        return result.success || result.retryable === false
            ? result
            : { ...result, message: `${label}: ${result.message}` };
    };
}

async function scheduler(): Promise<never> {
    logger.info(`Scheduler started. Time zone ${TIME_ZONE}.`);

    while (true) {
        const result = await runBookingCycle({
            now: () => DateTime.now().setZone(TIME_ZONE),
            sleep,
            isSkipped: (bookingDate) =>
                processFileLineByLine("./skip-dates.txt", (line) =>
                    skipEntryMatches(line, bookingDate, logger.warn),
                ),
            prepareBooking,
            notify: (title, message) => notif.send(title, message),
            log: logger.info,
        });

        // The weekend branch already slept until Monday.
        if (result.kind === "weekend") {
            continue;
        }

        if (result.kind === "processed") {
            const slots = result.attemptedSlots.length
                ? result.attemptedSlots.join(", ")
                : "none";
            logger.info(
                `Cycle done for ${result.bookingDate}; slots attempted: ${slots}.`,
            );
        }

        // Processed and skipped cycles both resume tomorrow.
        await sleepUntilTomorrow(
            DateTime.now().setZone(TIME_ZONE),
            sleep,
            logger.info,
        );
    }
}

scheduler().catch((e) => {
    if (e instanceof AppError) {
        logger.error(e.name, e.toJSON());
    } else {
        logger.error("Unhandled error", e);
    }

    process.exit(1);
});
