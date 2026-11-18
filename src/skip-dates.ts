import { DateTime } from "luxon";

export const SKIP_DATE_FORMAT = "dd-MM-yyyy";

const DATE = String.raw`\d{2}-\d{2}-\d{4}`;
const SINGLE = new RegExp(`^(${DATE})$`);
// Inclusive range: "01-12-2026 .. 05-12-2026" or "01-12-2026 to 05-12-2026".
const RANGE = new RegExp(`^(${DATE})\\s*(?:\\.\\.|to)\\s*(${DATE})$`, "i");

export type SkipEntry = { start: DateTime; end: DateTime };

function parseDate(value: string): DateTime | null {
    const parsed = DateTime.fromFormat(value, SKIP_DATE_FORMAT, { zone: "utc" });
    return parsed.isValid ? parsed : null;
}

/**
 * Parses one non-comment skip-file line into an inclusive date range.
 * A single date becomes a one-day range. Returns `null` for malformed
 * lines, impossible dates, and ranges whose start is after their end.
 */
export function parseSkipEntry(line: string): SkipEntry | null {
    const trimmed = line.trim();
    const single = SINGLE.exec(trimmed);
    if (single) {
        const date = parseDate(single[1]);
        return date ? { start: date, end: date } : null;
    }

    const range = RANGE.exec(trimmed);
    if (!range) return null;

    const start = parseDate(range[1]);
    const end = parseDate(range[2]);
    if (!start || !end || start > end) return null;

    return { start, end };
}

/**
 * Returns `true` when `bookingDate` (dd-MM-yyyy) is covered by `line`.
 * Ranges are checked by comparison, never expanded, so weekend days inside
 * a range cost nothing: the scheduler simply never asks about them.
 * Malformed lines never match and are reported through `warn`.
 */
export function skipEntryMatches(
    line: string,
    bookingDate: string,
    warn: (message: string) => void = console.warn,
): boolean {
    const entry = parseSkipEntry(line);
    if (!entry) {
        warn(`Ignoring invalid skip-dates.txt line: "${line}"`);
        return false;
    }

    const date = parseDate(bookingDate);
    if (!date) return false;

    return entry.start <= date && date <= entry.end;
}
