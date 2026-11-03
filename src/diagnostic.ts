import { DateTime } from "luxon";
import { retryBooking, type BookingResult } from "./core.js";
import { TIME_ZONE } from "./utils.js";

export interface DiagnosticDependencies {
    now: () => DateTime;
    sleep: (ms: number) => Promise<void>;
    isSkipped: () => Promise<boolean>;
    prepare: () => Promise<() => Promise<BookingResult>>;
    log: (event: string, details?: Record<string, unknown>) => void;
}

// One opening only; never starts the regular scheduler or sends notifications.
export async function runDiagnostic(opening: DateTime, deps: DiagnosticDependencies) {
    const now = () => deps.now().setZone(TIME_ZONE);
    if (!opening.isValid || opening.toMillis() <= now().toMillis()) {
        throw new Error("Opening must be a valid future timestamp");
    }
    deps.log("armed", { opening: opening.toISO(), retryDurationMs: 1500, retryIntervalMs: 250 });
    const prepareAt = opening.minus({ minutes: 5 });
    if (now().toMillis() < prepareAt.toMillis()) {
        await deps.sleep(prepareAt.toMillis() - now().toMillis());
    }
    if (await deps.isSkipped()) throw new Error("Booking date is skipped");
    const attempt = await deps.prepare();
    if (now().toMillis() > opening.toMillis()) throw new Error("Preparation missed opening");
    while (now().toMillis() < opening.toMillis()) {
        await deps.sleep(opening.toMillis() - now().toMillis());
    }
    if (await deps.isSkipped()) throw new Error("Booking date is skipped");
    // Do not book on a much later wake after computer suspension.
    if (now().toMillis() - opening.toMillis() >= 1500) throw new Error("Opening missed after wake");
    const result = await retryBooking(attempt, {
        nowMs: () => now().toMillis(), sleep: deps.sleep,
        intervalMs: 250, maxDurationMs: 1500,
        log: (message) => deps.log("retry", { message }),
    });
    deps.log("result", { ...result });
    return result;
}

// Allowlist response evidence: never persist arbitrary server text or identifiers.
export function bookingEvidence(data: unknown) {
    const body = data as { message?: unknown; status?: { name?: unknown } } | null;
    const message = typeof body?.message === "string"
        ? (/you cannot book this far in advance/i.test(body.message)
            ? "You cannot book this far in advance" : "Other API message (omitted)")
        : undefined;
    const name = body?.status?.name;
    return { message, bookingStatus: name === "BOOKED" || name === "WAITING" ? name : "unknown" };
}
