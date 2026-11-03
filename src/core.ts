import { DateTime } from "luxon";
import { NEXT_SLOT_DAYS, TIME_ZONE } from "./utils.js";

export const BOOKING_SLOTS = ["18:00", "18:30"] as const;

const ATTEMPT_TIMES = [
    ["19:00", "19:30"], // Out of DST (Winter)
    ["19:00", "19:30"], // In DST (Summer)
] as const;

export const PREPARE_AHEAD_MS = 5 * 60 * 1000;

export interface BookingResult {
    success: boolean;
    title: string;
    message: string;
}

export interface SchedulerDependencies {
    now: () => DateTime;
    sleep: (ms: number) => Promise<void>;
    isSkipped: (bookingDate: string) => Promise<boolean>;

    // Runs login, profile lookup, schedule lookup and session selection.
    // Returns a function that performs the actual booking attempt.
    prepareBooking: (
        slotTime: string,
        bookingDate: string,
    ) => Promise<() => Promise<BookingResult>>;

    notify: (title: string, message: string) => Promise<void>;
    log?: (message: string) => void;
}

export type CycleResult =
    | { kind: "weekend"; nextRunAt: DateTime }
    | { kind: "skipped"; bookingDate: string }
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

export async function runBookingCycle(
    deps: SchedulerDependencies,
): Promise<CycleResult> {
    const { now: clock, sleep, log = console.log } = deps;

    let now = clock().setZone(TIME_ZONE);

    // Luxon weekdays: Monday = 1, Sunday = 7.
    if (now.weekday > 5) {
        const daysUntilMonday = 8 - now.weekday;
        const nextMonday = now.plus({ days: daysUntilMonday }).startOf("day");

        log(`Weekend. Sleeping until ${nextMonday.toISO()}`);
        await sleep(nextMonday.toMillis() - now.toMillis());

        return { kind: "weekend", nextRunAt: nextMonday };
    }

    // Exactly 14 calendar days ahead in Sofia's local calendar.
    const bookingDate = now
        .startOf("day")
        .plus({ days: NEXT_SLOT_DAYS })
        .toFormat("dd-MM-yyyy");

    if (await deps.isSkipped(bookingDate)) {
        log(`Skipping booking date ${bookingDate}`);

        await deps.notify(
            "Booking Skipped",
            `Booking for ${bookingDate} was skipped.`,
        );

        return { kind: "skipped", bookingDate };
    }

    // Select the attempt schedule using the current Sofia DST status.
    const attemptTimeIdx = now.isInDST ? 1 : 0;
    const attemptedSlots: string[] = [];

    for (let i = 0; i < BOOKING_SLOTS.length; i++) {
        const slotTime = BOOKING_SLOTS[i];
        const attemptTime = ATTEMPT_TIMES[attemptTimeIdx][i];

        now = clock().setZone(TIME_ZONE);
        const target = atTime(now.startOf("day"), attemptTime);

        // Never attempt a slot whose opening time has passed.
        if (target.toMillis() <= now.toMillis()) {
            log(
                `Skipping ${slotTime}; attempt time ${attemptTime} has passed.`,
            );
            continue;
        }

        const prepareAt = target.minus({ milliseconds: PREPARE_AHEAD_MS });

        log(
            `Slot ${slotTime}: prepare at ${prepareAt.toFormat("yyyy-MM-dd HH:mm:ss ZZZZ")}; ` +
                `attempt at ${target.toFormat("yyyy-MM-dd HH:mm:ss ZZZZ")}`,
        );

        // Wait until five minutes before the attempt time.
        now = clock().setZone(TIME_ZONE);

        if (now.toMillis() < prepareAt.toMillis()) {
            await sleep(prepareAt.toMillis() - now.toMillis());
        }

        // Preparation may take time; it must not itself book the session.
        const attemptBooking = await deps.prepareBooking(slotTime, bookingDate);

        // Re-read the clock after preparation, rather than trusting an
        // earlier timestamp.
        now = clock().setZone(TIME_ZONE);

        if (now.toMillis() > target.toMillis()) {
            const result: BookingResult = {
                success: false,
                title: "Booking Missed",
                message:
                    `Missed booking window for ${bookingDate}, ${slotTime}. ` +
                    `Preparation finished after ${attemptTime}.`,
            };

            await deps.notify(result.title, result.message);
            continue;
        }

        // Wait until the precise attempt time.
        if (now.toMillis() < target.toMillis()) {
            await sleep(target.toMillis() - now.toMillis());
        }

        // This is the only point where the actual booking is triggered.
        attemptedSlots.push(slotTime);

        log(
            `Attempting ${slotTime} at ${clock().setZone(TIME_ZONE).toFormat("HH:mm:ss.SSS")}`,
        );

        try {
            const result = await attemptBooking();
            await deps.notify(result.title, result.message);
        } catch (error) {
            const message =
                error instanceof Error ? error.message : String(error);
            log(`Booking ${slotTime} threw: ${message}`);
            await deps.notify("Booking Error", message);
        }
    }

    return { kind: "processed", bookingDate, attemptedSlots };
}

export async function sleepUntilTomorrow(
    now: DateTime,
    sleep: (ms: number) => Promise<void>,
): Promise<void> {
    const tomorrow = nextMidnight(now.setZone(TIME_ZONE));
    await sleep(tomorrow.toMillis() - now.toMillis());
}

export async function retryBooking(
    book: () => Promise<BookingResult>,
    options: RetryOptions,
): Promise<BookingResult> {
    const intervalMs = options.intervalMs ?? 250;
    const maxDurationMs = options.maxDurationMs ?? 1_500;
    const log = options.log ?? (() => {});

    const startedAt = options.nowMs();
    let attempt = 0;

    while (true) {
        const nextAttemptAt = startedAt + attempt * intervalMs;
        const waitMs = nextAttemptAt - options.nowMs();

        if (waitMs > 0) {
            await options.sleep(waitMs);
        }

        if (options.nowMs() - startedAt >= maxDurationMs) {
            return {
                success: false,
                title: "Session Not Booked",
                message: `Booking was not accepted within ${maxDurationMs / 1000} seconds.`,
            };
        }

        attempt++;

        log(`Booking attempt #${attempt}`);

        const result = await book();

        if (result.success) {
            return result;
        }

        log(`Attempt #${attempt} rejected: ${result.message}`);
    }
}
