import { mkdirSync, appendFileSync } from "node:fs";
import { DateTime } from "luxon";
import { API } from "./api/index.js";
import { hit, getSession, sleep, TIME_ZONE, NEXT_SLOT_DAYS, processFileLineByLine } from "./utils.js";
import { bookingEvidence, runDiagnostic } from "./diagnostic.js";

const [openingArg, date, slot] = process.argv.slice(2);
const opening = DateTime.fromISO(openingArg ?? "", { setZone: true }).setZone(TIME_ZONE);
if (!opening.isValid || !/^\d{4}-\d{2}-\d{2}$/.test(date ?? "") || !/^([01]\d|2[0-3]):(00|30)$/.test(slot ?? "")) {
    throw new Error("Usage: diagnose-booking <opening ISO with offset> <booking yyyy-MM-dd> <slot HH:mm>");
}
if (date !== opening.startOf("day").plus({ days: NEXT_SLOT_DAYS }).toISODate()) {
    throw new Error("Booking date must be 14 Sofia calendar days after opening");
}
mkdirSync("logs", { recursive: true });
const logPath = `logs/booking-${opening.toFormat("yyyyMMdd-HHmmss")}.jsonl`;
const log = (event: string, details: Record<string, unknown> = {}) => {
    const line = JSON.stringify({ at: DateTime.now().setZone(TIME_ZONE).toISO(), event, ...details });
    appendFileSync(logPath, line + "\n", { encoding: "utf8", mode: 0o600 });
    console.info(line);
};

// Observe the existing transport without recording URLs, bodies, headers with
// credentials, profile data, or raw error objects. Login responses stay in memory.
const realFetch = globalThis.fetch;
globalThis.fetch = async (input, init) => {
    const pathname = new URL(String(input)).pathname;
    const endpoint = ["/login", "/users/me", "/class-dates", "/class-bookings"].find((p) => pathname.endsWith(p));
    const started = Date.now();
    log("http_start", { endpoint: endpoint ?? "other", method: init?.method });
    try {
        const response = await realFetch(input, init);
        log("http_response", {
            endpoint: endpoint ?? "other", status: response.status,
            startedAt: new Date(started).toISOString(), elapsedMs: Date.now() - started,
            serverDate: response.headers.get("date"),
        });
        return response;
    } catch (error) {
        const knownCodes = new Set(["EPERM", "EACCES", "ENOTFOUND", "ECONNREFUSED", "ECONNRESET", "ETIMEDOUT", "UND_ERR_REQ_CONTENT_LENGTH_MISMATCH", "UND_ERR_CONNECT_TIMEOUT", "UND_ERR_SOCKET", "CERT_HAS_EXPIRED", "UNABLE_TO_VERIFY_LEAF_SIGNATURE"]);
        let cause: unknown = error;
        const codes: string[] = [];
        for (let depth = 0; depth < 5 && cause && typeof cause === "object"; depth++) {
            const entry = cause as { code?: unknown; cause?: unknown };
            if (typeof entry.code === "string" && knownCodes.has(entry.code)) codes.push(entry.code);
            cause = entry.cause;
        }
        log("http_failure", { endpoint: endpoint ?? "other", elapsedMs: Date.now() - started, codes });
        throw new Error("HTTP request failed (sensitive details omitted)");
    }
};

try {
    const result = await runDiagnostic(opening, {
        now: () => DateTime.now(), sleep, log,
        isSkipped: () => processFileLineByLine("./skip-dates.txt", (line) => line === DateTime.fromISO(date).toFormat("dd-MM-yyyy")),
        prepare: async () => {
            const user = await API.Login();
            if (typeof user.accessToken !== "string") throw new Error("Login returned no access token");
            const me = await API.GetMe(user.accessToken);
            if (typeof me.id !== "number") throw new Error("Profile returned no user ID");
            const schedule = await API.GetSchedule(user.accessToken);
            const session = getSession(schedule, slot);
            const validDate = (value: unknown) => typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : "invalid";
            const validTime = (value: unknown) => typeof value === "string" && /^\d{2}:\d{2}(:\d{2})?$/.test(value) ? value : "invalid";
            log("session_selected", {
                requestedDate: date, requestedSlot: slot,
                date: validDate(session?.date), startTime: validTime(session?.startTime),
                thresholdDate: validDate(session?.bookingThresholdDate), thresholdTime: validTime(session?.bookingThresholdTime),
                alreadyOccupied: (session?.bookingsCount ?? 0) > 0,
            });
            if (!session || session.date !== date || session.startTime.slice(0, 5) !== slot) {
                throw new Error("Positional session selection does not match requested date/time");
            }
            if (session.bookingsCount > 0) throw new Error("Session already occupied; no waiting-list booking attempted");
            return async () => {
                const data = await hit<unknown>("/class-bookings", "POST", {
                    headers: [["Authorization", `Bearer ${user.accessToken}`]],
                    body: { classDateId: session.id, userId: me.id },
                });
                const evidence = bookingEvidence(data);
                log("booking_response", evidence);
                const success = evidence.bookingStatus === "BOOKED" && !evidence.message;
                // A waiting-list or ambiguous response must not cause duplicate POSTs.
                if (!evidence.message && !success) throw new Error("Unconfirmed booking status; stopped for manual review");
                return { success, title: success ? "Session Booked" : "Session Not Booked", message: evidence.message ?? "BOOKED" };
            };
        },
    });
    process.exitCode = result.success ? 0 : 2;
} catch (error) {
    const safeReasons = new Set([
        "Opening must be a valid future timestamp", "Booking date is skipped",
        "Preparation missed opening", "Opening missed after wake", "Login returned no access token",
        "Profile returned no user ID", "Positional session selection does not match requested date/time",
        "Session already occupied; no waiting-list booking attempted",
        "Unconfirmed booking status; stopped for manual review", "HTTP request failed (sensitive details omitted)",
        "login failed", "session/me failed", "unable to obtain schedule",
    ]);
    const reason = error instanceof Error && safeReasons.has(error.message) ? error.message : "Unexpected failure (sensitive details omitted)";
    log("stopped", { reason });
    process.exitCode = 1;
} finally {
    globalThis.fetch = realFetch;
}
