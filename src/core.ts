import { DateTime } from "luxon";
import { NEXT_SLOT_DAYS, TIME_ZONE } from "./utils.js";
import { logger } from "./logger.js";

export const BOOKING_SLOTS = ["18:00", "18:30"] as const;

const ATTEMPT_TIMES = [
    ["19:00", "19:30"], // Out of DST (Winter)
    ["19:00", "19:30"], // In DST (Summer)
] as const;

export const PREPARE_AHEAD_MS = 5 * 60 * 1000;
export const RETRY_INTERVAL_MS = 250;
export const RETRY_DURATION_MS = 4_000;
/** Open a keep-alive connection this long before the booking time. */
export const WARMUP_LEAD_MS = 2_000;
/** Busy-wait the final stretch; setTimeout can wake up to ~16 ms late on Windows. */
export const SPIN_MS = 30;

export interface BookingResult {
    success: boolean;
    title: string;
    message: string;
    /** `false` stops retrying immediately (e.g. waiting list, unknown status). Defaults to retryable. */
    retryable?: boolean;
}

/**
 * The prepared booking attempt. `warmUp` (optional) is started shortly before
 * the booking time so the attempt reuses an open connection.
 */
export type PreparedBooking = (() => Promise<BookingResult>) & {
    warmUp?: () => Promise<void>;
};

export interface SchedulerDependencies {
    now: () => DateTime;
    sleep: (ms: number) => Promise<void>;
    isSkipped: (bookingDate: string) => Promise<boolean>;

    // Runs login, profile lookup, schedule lookup and session selection.
    // Returns a function that performs the actual booking attempt.
    prepareBooking: (
        slotTime: string,
        bookingDate: string,
    ) => Promise<PreparedBooking>;

    /** Resolves as close to `targetMs` as possible. Defaults to a plain sleep. */
    waitUntil?: (targetMs: number) => Promise<void>;

    notify: (
        title: string,
        message: string,
        priority?: NotificationPriority,
    ) => Promise<void>;
    log?: (message: string) => void;
}

export type NotificationPriority = "low" | "default" | "high";

export type CycleResult =
    | { kind: "weekend"; nextRunAt: DateTime }
    | { kind: "skipped"; bookingDate: string; attemptedSlots: string[] }
    | { kind: "processed"; bookingDate: string; attemptedSlots: string[] };

export interface RetryOptions {
    nowMs: () => number;
    sleep: (ms: number) => Promise<void>;
    intervalMs?: number;
    maxDurationMs?: number;
    log?: (message: string) => void;
}

function atTime(day: DateTime, time: string): DateTime {
    const [hour, minute] = time.split(":").map(Number);

    return day.set({
        hour,
        minute,
        second: 0,
        millisecond: 0,
    });
}

function nextMidnight(now: DateTime): DateTime {
    return now.plus({ days: 1 }).startOf("day");
}

/**
 * Sleeps until `spinMs` before the target, then busy-waits to the exact
 * millisecond. Never resolves before `targetMs`.
 */
export async function waitUntil(
    targetMs: number,
    nowMs: () => number,
    sleep: (ms: number) => Promise<void>,
    spinMs: number = SPIN_MS,
): Promise<void> {
    const remaining = targetMs - nowMs();
    if (remaining > spinMs) {
        await sleep(remaining - spinMs);
    }
    while (nowMs() < targetMs) {
        // Busy-wait; nothing else needs the event loop at this moment.
    }
}

export async function runBookingCycle(
    deps: SchedulerDependencies,
): Promise<CycleResult> {
    const { now: clock, sleep, log = logger.info } = deps;

    let now = clock().setZone(TIME_ZONE);

    // Luxon weekdays: Monday = 1, Sunday = 7.
    if (now.weekday > 5) {
        const daysUntilMonday = 8 - now.weekday;
        const nextMonday = now.plus({ days: daysUntilMonday }).startOf("day");

        log(`Weekend. Sleeping until ${nextMonday.toFormat("yyyy-MM-dd HH:mm")}.`);
        await sleep(nextMonday.toMillis() - now.toMillis());

        return { kind: "weekend", nextRunAt: nextMonday };
    }

    // Exactly 14 calendar days ahead in Sofia's local calendar.
    const bookingDate = now
        .startOf("day")
        .plus({ days: NEXT_SLOT_DAYS })
        .toFormat("dd-MM-yyyy");

    log(
        `Booking date ${bookingDate}; slots ${BOOKING_SLOTS.join(", ")}. ` +
            `skip-dates.txt is checked when preparing each slot.`,
    );

    // Select the attempt schedule using the current Sofia DST status.
    const attemptTimeIdx = now.isInDST ? 1 : 0;
    const attemptedSlots: string[] = [];

    // Checked at preparation time (not at midnight, and not in the
    // timing-critical moment before booking) so same-day edits apply and the
    // push arrives at a sensible hour.
    const checkSkip = async (slotTime: string): Promise<"ok" | "skip" | "error"> => {
        try {
            if (!(await deps.isSkipped(bookingDate))) return "ok";
        } catch (error) {
            const message =
                error instanceof Error ? error.message : String(error);
            log(`Slot ${slotTime}: could not read skip-dates.txt: ${message}; not booking.`);
            await deps.notify(
                "Booking Error",
                `${bookingDate} ${slotTime}: could not read skip-dates.txt (${message}); not booked.`,
            );
            return "error";
        }

        log(`Booking date ${bookingDate} is in skip-dates.txt; skipping remaining slots.`);
        await deps.notify(
            "Booking Skipped",
            `Booking for ${bookingDate} was skipped.`,
            "default",
        );
        return "skip";
    };

    for (let i = 0; i < BOOKING_SLOTS.length; i++) {
        const slotTime = BOOKING_SLOTS[i];
        const attemptTime = ATTEMPT_TIMES[attemptTimeIdx][i];

        now = clock().setZone(TIME_ZONE);
        const target = atTime(now.startOf("day"), attemptTime);

        // Never attempt a slot whose opening time has passed.
        if (target.toMillis() <= now.toMillis()) {
            log(
                `Slot ${slotTime}: booking time ${attemptTime} has passed; not attempting.`,
            );
            continue;
        }

        const prepareAt = target.minus({ milliseconds: PREPARE_AHEAD_MS });

        log(
            `Slot ${slotTime}: waiting; prepare at ${prepareAt.toFormat("HH:mm:ss")}, ` +
                `book at ${target.toFormat("HH:mm:ss")} (${target.toFormat("ZZZZ")}).`,
        );

        // Wait until five minutes before the attempt time.
        now = clock().setZone(TIME_ZONE);

        if (now.toMillis() < prepareAt.toMillis()) {
            await sleep(prepareAt.toMillis() - now.toMillis());
        }

        const beforePrepare = await checkSkip(slotTime);
        if (beforePrepare === "skip") {
            return { kind: "skipped", bookingDate, attemptedSlots };
        }
        if (beforePrepare === "error") continue;

        // Preparation may take time; it must not itself book the session.
        // A failed preparation (login, schedule, wrong session) must not stop
        // the scheduler or the next slot.
        log(`Slot ${slotTime}: preparing.`);
        let attemptBooking: PreparedBooking;
        try {
            attemptBooking = await deps.prepareBooking(slotTime, bookingDate);
        } catch (error) {
            const message =
                error instanceof Error ? error.message : String(error);
            log(`Slot ${slotTime}: preparation failed: ${message}`);
            await deps.notify(
                "Booking Error",
                `${bookingDate} ${slotTime}: preparation failed: ${message}`,
            );
            continue;
        }

        // Re-read the clock after preparation, rather than trusting an
        // earlier timestamp.
        now = clock().setZone(TIME_ZONE);

        if (now.toMillis() > target.toMillis()) {
            const result: BookingResult = {
                success: false,
                title: "Booking Missed",
                message:
                    `${bookingDate} ${slotTime}: preparation finished after ` +
                    `${attemptTime}; not attempted.`,
            };

            log(`Slot ${slotTime}: ${result.title}: ${result.message}`);
            await deps.notify(result.title, result.message);
            continue;
        }

        const wait =
            deps.waitUntil ??
            (async (targetMs: number) => {
                const ms = targetMs - clock().toMillis();
                if (ms > 0) await sleep(ms);
            });

        // Open a connection shortly before the booking time so the first
        // request skips DNS/TCP/TLS. Not awaited: it must never delay booking.
        let warmUp = "not used";
        if (attemptBooking.warmUp) {
            await wait(target.toMillis() - WARMUP_LEAD_MS);
            const warmStart = clock().toMillis();
            warmUp = "still pending at booking time";
            attemptBooking.warmUp().then(
                () => { warmUp = `done in ${clock().toMillis() - warmStart} ms`; },
                (error) => { warmUp = `failed: ${error instanceof Error ? error.message : String(error)}`; },
            );
        }

        await wait(target.toMillis());

        // This is the only point where the actual booking is triggered.
        // Nothing (not even logging) runs between the wait and the request.
        const firedAt = clock();
        attemptedSlots.push(slotTime);

        try {
            const result = await attemptBooking();
            log(
                `Slot ${slotTime}: fired at ${firedAt.setZone(TIME_ZONE).toFormat("HH:mm:ss.SSS")} ` +
                    `(+${firedAt.toMillis() - target.toMillis()} ms after target; warm-up ${warmUp}).`,
            );
            log(`Slot ${slotTime}: ${result.title}: ${result.message}`);
            await deps.notify(result.title, result.message);
        } catch (error) {
            const message =
                error instanceof Error ? error.message : String(error);
            log(`Slot ${slotTime}: booking threw: ${message}`);
            await deps.notify(
                "Booking Error",
                `${bookingDate} ${slotTime}: ${message}`,
            );
        }
    }

    return { kind: "processed", bookingDate, attemptedSlots };
}

export async function sleepUntilTomorrow(
    now: DateTime,
    sleep: (ms: number) => Promise<void>,
    log: (message: string) => void = logger.info,
): Promise<void> {
    const tomorrow = nextMidnight(now.setZone(TIME_ZONE));
    log(`Sleeping until ${tomorrow.toFormat("yyyy-MM-dd HH:mm")}.`);
    await sleep(tomorrow.toMillis() - now.toMillis());
}

export async function retryBooking(
    book: () => Promise<BookingResult>,
    options: RetryOptions,
): Promise<BookingResult> {
    const intervalMs = options.intervalMs ?? RETRY_INTERVAL_MS;
    const maxDurationMs = options.maxDurationMs ?? RETRY_DURATION_MS;
    const log = options.log ?? (() => {});

    const startedAt = options.nowMs();
    let attempt = 0;
    let lastMessage = "none";

    while (true) {
        const nextAttemptAt = startedAt + attempt * intervalMs;
        const waitMs = nextAttemptAt - options.nowMs();

        if (waitMs > 0) {
            await options.sleep(waitMs);
        }

        const sentAt = options.nowMs();

        if (options.nowMs() - startedAt >= maxDurationMs) {
            return {
                success: false,
                title: "Session Not Booked",
                message:
                    `No success within ${maxDurationMs / 1000} s ` +
                    `(${attempt} attempts). Last response: ${lastMessage}`,
            };
        }

        attempt++;

        // Log only after the response, so nothing delays sending.
        const result = await book();
        const timing = `(+${sentAt - startedAt} ms, ${options.nowMs() - sentAt} ms round trip)`;

        if (result.success) {
            log(`Attempt #${attempt} ${timing} succeeded.`);
            return result;
        }

        if (result.retryable === false) {
            log(`Attempt #${attempt} ${timing} not retryable: ${result.message}`);
            return result;
        }

        lastMessage = result.message;
        log(`Attempt #${attempt} ${timing} rejected: ${result.message}`);
    }
}
