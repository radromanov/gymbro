import { describe, expect, it, vi } from "vitest";
import { DateTime } from "luxon";

vi.mock("../src/utils.js", () => ({ TIME_ZONE: "Europe/Sofia", NEXT_SLOT_DAYS: 14 }));
import { PREPARE_AHEAD_MS, retryBooking, runBookingCycle, type SchedulerDependencies } from "../src/core.js";

function fixture(iso: string) {
    let clock = DateTime.fromISO(iso, { setZone: true });
    const local = () => clock.setZone("Europe/Sofia").toFormat("HH:mm:ss");
    const prepared: string[] = [];
    const attempted: string[] = [];
    const deps: SchedulerDependencies = {
        now: () => clock,
        sleep: vi.fn(async (ms) => { clock = clock.plus({ milliseconds: ms }); }),
        isSkipped: vi.fn(async () => false),
        prepareBooking: vi.fn(async (slot: string) => {
            prepared.push(`${slot}@${local()}`);
            return async () => {
                attempted.push(`${slot}@${local()}`);
                return { success: true, title: "Booked", message: "ok" };
            };
        }),
        notify: vi.fn(async () => {}),
        log: vi.fn(),
    };
    return { deps, prepared, attempted };
}

describe("recurring booking cycle", () => {
    // Winter (EET, +02:00) and summer (EEST, +03:00) use the same local times.
    it.each([
        ["winter", "2026-11-18T08:00:00+02:00", "02-12-2026"],
        ["summer", "2026-07-07T08:00:00+03:00", "21-07-2026"],
    ])("attempts 18:00/18:30 slots at 19:00/19:30 Sofia time in %s", async (_season, iso, bookingDate) => {
        const f = fixture(iso);
        const result = await runBookingCycle(f.deps);

        expect(PREPARE_AHEAD_MS).toBe(5 * 60 * 1000);
        expect(f.prepared).toEqual(["18:00@18:55:00", "18:30@19:25:00"]);
        expect(f.attempted).toEqual(["18:00@19:00:00", "18:30@19:30:00"]);
        expect(f.deps.isSkipped).toHaveBeenCalledWith(bookingDate);
        expect(result).toEqual({ kind: "processed", bookingDate, attemptedSlots: ["18:00", "18:30"] });
    });

    it("skips a slot whose attempt time has passed", async () => {
        const f = fixture("2026-11-18T19:10:00+02:00");
        const result = await runBookingCycle(f.deps);
        expect(f.attempted).toEqual(["18:30@19:30:00"]);
        expect(result).toMatchObject({ kind: "processed", attemptedSlots: ["18:30"] });
    });

    it("does not prepare or book a skipped date", async () => {
        const f = fixture("2026-11-18T08:00:00+02:00");
        vi.mocked(f.deps.isSkipped).mockResolvedValue(true);
        const result = await runBookingCycle(f.deps);
        expect(f.deps.prepareBooking).not.toHaveBeenCalled();
        expect(f.deps.notify).toHaveBeenCalledWith("Booking Skipped", "Booking for 02-12-2026 was skipped.");
        expect(result).toEqual({ kind: "skipped", bookingDate: "02-12-2026" });
    });

    it("sleeps through the weekend without checking skips", async () => {
        const f = fixture("2026-11-21T08:00:00+02:00"); // Saturday
        const result = await runBookingCycle(f.deps);
        expect(f.deps.isSkipped).not.toHaveBeenCalled();
        expect(result.kind).toBe("weekend");
        expect(f.deps.sleep).toHaveBeenCalledWith(40 * 60 * 60 * 1000); // until Monday 00:00
    });

    it("keeps going after a failed preparation and notifies", async () => {
        const f = fixture("2026-11-18T08:00:00+02:00");
        const original = f.deps.prepareBooking;
        vi.mocked(f.deps.prepareBooking).mockImplementationOnce(async () => { throw new Error("schedule returned 2026-12-02 17:30:00 instead of 2026-12-02 18:00"); });
        const result = await runBookingCycle(f.deps);
        expect(original).toHaveBeenCalledTimes(2);
        expect(f.deps.notify).toHaveBeenCalledWith("Booking Error", "02-12-2026 18:00: preparation failed: schedule returned 2026-12-02 17:30:00 instead of 2026-12-02 18:00");
        expect(f.attempted).toEqual(["18:30@19:30:00"]);
        expect(result).toMatchObject({ kind: "processed", attemptedSlots: ["18:30"] });
    });
});

describe("retryBooking", () => {
    function clock() {
        let t = 0;
        return { nowMs: () => t, sleep: vi.fn(async (ms: number) => { t += ms; }), log: vi.fn() };
    }

    it("retries rejections for 4 s at 250 ms and reports the last response", async () => {
        const c = clock();
        const book = vi.fn(async () => ({ success: false, title: "Session Not Booked", message: "You cannot book this far in advance" }));
        const result = await retryBooking(book, c);
        expect(book).toHaveBeenCalledTimes(16);
        expect(result).toEqual({ success: false, title: "Session Not Booked", message: "No success within 4 s (16 attempts). Last response: You cannot book this far in advance" });
    });

    it("logs success and stops", async () => {
        const c = clock();
        const book = vi.fn()
            .mockResolvedValueOnce({ success: false, title: "x", message: "not yet" })
            .mockResolvedValueOnce({ success: true, title: "Session Booked", message: "Booked." });
        const result = await retryBooking(book, c);
        expect(result.success).toBe(true);
        expect(book).toHaveBeenCalledTimes(2);
        expect(c.log).toHaveBeenCalledWith("Attempt #2 succeeded.");
    });

    it("never retries a non-retryable result such as the waiting list", async () => {
        const c = clock();
        const waiting = { success: false, retryable: false, title: "Waiting List", message: "placed on the waiting list" };
        const book = vi.fn(async () => waiting);
        expect(await retryBooking(book, c)).toBe(waiting);
        expect(book).toHaveBeenCalledTimes(1);
    });
});
