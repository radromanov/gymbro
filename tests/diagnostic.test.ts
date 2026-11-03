import { describe, expect, it, vi } from "vitest";
import { DateTime } from "luxon";

vi.mock("../src/utils.js", () => ({ TIME_ZONE: "Europe/Sofia", NEXT_SLOT_DAYS: 14 }));
import { bookingEvidence, runDiagnostic, type DiagnosticDependencies } from "../src/diagnostic.js";

function fixture(iso = "2026-11-03T07:20:00+02:00") {
    let clock = DateTime.fromISO(iso, { setZone: true });
    const attempts: string[] = [];
    const attempt = vi.fn(async () => {
        attempts.push(clock.toISO()!);
        return { success: false, title: "Rejected", message: "You cannot book this far in advance" };
    });
    const deps: DiagnosticDependencies = {
        now: () => clock,
        sleep: vi.fn(async (ms) => { clock = clock.plus({ milliseconds: ms }); }),
        isSkipped: vi.fn(async () => false),
        prepare: vi.fn(async () => attempt), log: vi.fn(),
    };
    return { deps, attempt, attempts, advance: (ms: number) => { clock = clock.plus({ milliseconds: ms }); } };
}

describe("one-off diagnostic", () => {
    it.each(["2026-11-03T07:20:00+02:00", "2026-07-07T07:20:00+03:00"])("preserves local opening and retry bounds: %s", async (iso) => {
        const f = fixture(iso);
        const opening = DateTime.fromISO(iso, { setZone: true }).plus({ minutes: 10 });
        const result = await runDiagnostic(opening, f.deps);
        expect(f.deps.sleep).toHaveBeenNthCalledWith(1, 300000);
        expect(f.deps.sleep).toHaveBeenNthCalledWith(2, 300000);
        expect(f.attempts).toHaveLength(6);
        expect(f.attempts.map((time) => DateTime.fromISO(time).toMillis() - opening.toMillis())).toEqual([0, 250, 500, 750, 1000, 1250]);
        expect(result.success).toBe(false);
    });
    it("stops after success", async () => {
        const f = fixture();
        f.attempt.mockResolvedValue({ success: true, title: "Booked", message: "BOOKED" });
        expect((await runDiagnostic(DateTime.fromISO("2026-11-03T07:30:00+02:00"), f.deps)).success).toBe(true);
        expect(f.attempt).toHaveBeenCalledTimes(1);
    });
    it("honors skip dates before preparation", async () => {
        const f = fixture();
        f.deps.isSkipped = async () => true;
        await expect(runDiagnostic(DateTime.fromISO("2026-11-03T07:30:00+02:00"), f.deps)).rejects.toThrow("skipped");
        expect(f.deps.prepare).not.toHaveBeenCalled();
    });
    it("rechecks skips at opening", async () => {
        const f = fixture();
        f.deps.isSkipped = vi.fn().mockResolvedValueOnce(false).mockResolvedValueOnce(true);
        await expect(runDiagnostic(DateTime.fromISO("2026-11-03T07:30:00+02:00"), f.deps)).rejects.toThrow("skipped");
        expect(f.attempt).not.toHaveBeenCalled();
    });
    it("does not book after late preparation", async () => {
        const f = fixture();
        f.deps.prepare = async () => { f.advance(300001); return f.attempt; };
        await expect(runDiagnostic(DateTime.fromISO("2026-11-03T07:30:00+02:00"), f.deps)).rejects.toThrow("Preparation missed");
        expect(f.attempt).not.toHaveBeenCalled();
    });
    it("does not book after suspended wake", async () => {
        const f = fixture("2026-11-03T07:29:00+02:00");
        f.deps.sleep = async (ms) => { f.advance(ms + 2000); };
        await expect(runDiagnostic(DateTime.fromISO("2026-11-03T07:30:00+02:00"), f.deps)).rejects.toThrow("wake");
        expect(f.attempt).not.toHaveBeenCalled();
    });
    it("rejects past openings without preparation", async () => {
        const f = fixture();
        await expect(runDiagnostic(DateTime.fromISO("2026-11-03T07:19:00+02:00"), f.deps)).rejects.toThrow("future");
        expect(f.deps.prepare).not.toHaveBeenCalled();
    });
    it("stops on thrown/ambiguous booking errors without retrying", async () => {
        const f = fixture();
        f.attempt.mockRejectedValue(new Error("Unconfirmed booking status"));
        await expect(runDiagnostic(DateTime.fromISO("2026-11-03T07:30:00+02:00"), f.deps)).rejects.toThrow("Unconfirmed");
        expect(f.attempt).toHaveBeenCalledTimes(1);
    });
});

describe("safe response evidence", () => {
    it("keeps the target rejection without arbitrary text or account data", () => {
        expect(bookingEvidence({ message: "You cannot book this far in advance", userId: 123, token: "mock-secret" })).toEqual({ message: "You cannot book this far in advance", bookingStatus: "unknown" });
        expect(JSON.stringify(bookingEvidence({ message: "mock@example.test mock-secret", status: { name: "private-name" } }))).not.toMatch(/mock|private/);
    });
    it("only accepts explicit known statuses", () => {
        expect(bookingEvidence({ status: { name: "BOOKED" } }).bookingStatus).toBe("BOOKED");
        expect(bookingEvidence({ status: { name: "WAITING" } }).bookingStatus).toBe("WAITING");
        expect(bookingEvidence(null).bookingStatus).toBe("unknown");
        expect(bookingEvidence({}).bookingStatus).toBe("unknown");
    });
});
