import { describe, expect, it, vi } from "vitest";
import { DateTime } from "luxon";

vi.mock("../src/utils.js", () => ({ TIME_ZONE: "Europe/Sofia", NEXT_SLOT_DAYS: 14 }));
import { PREPARE_AHEAD_MS, runBookingCycle, type SchedulerDependencies } from "../src/core.js";

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
});
