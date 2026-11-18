import { describe, expect, it, vi } from "vitest";
import { parseSkipEntry, skipEntryMatches } from "../src/skip-dates.js";

describe("skip-dates entries", () => {
    it("matches a single date exactly", () => {
        expect(skipEntryMatches("26-11-2026", "26-11-2026")).toBe(true);
        expect(skipEntryMatches("26-11-2026", "27-11-2026")).toBe(false);
    });

    it.each(["01-12-2026..05-12-2026", "01-12-2026 .. 05-12-2026", "01-12-2026 to 05-12-2026", "01-12-2026 TO 05-12-2026"])(
        "treats %s as an inclusive range",
        (line) => {
            expect(skipEntryMatches(line, "30-11-2026")).toBe(false);
            expect(skipEntryMatches(line, "01-12-2026")).toBe(true);
            expect(skipEntryMatches(line, "03-12-2026")).toBe(true);
            expect(skipEntryMatches(line, "05-12-2026")).toBe(true);
            expect(skipEntryMatches(line, "06-12-2026")).toBe(false);
        },
    );

    it("spans month and year boundaries", () => {
        const line = "28-12-2026..04-01-2027";
        expect(skipEntryMatches(line, "31-12-2026")).toBe(true);
        expect(skipEntryMatches(line, "02-01-2027")).toBe(true);
        expect(skipEntryMatches(line, "05-01-2027")).toBe(false);
    });

    it("spans the October DST change without gaps", () => {
        const line = "24-10-2026..26-10-2026";
        expect(skipEntryMatches(line, "25-10-2026")).toBe(true);
        expect(skipEntryMatches(line, "26-10-2026")).toBe(true);
    });

    it.each(["05-12-2026..01-12-2026", "31-02-2026", "2026-12-01", "01-12-2026 - 05-12-2026", "garbage"])(
        "rejects and warns on invalid line %s",
        (line) => {
            const warn = vi.fn();
            expect(parseSkipEntry(line)).toBeNull();
            expect(skipEntryMatches(line, "01-12-2026", warn)).toBe(false);
            expect(warn).toHaveBeenCalledOnce();
        },
    );
});
