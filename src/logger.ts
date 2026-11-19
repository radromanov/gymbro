import { DateTime } from "luxon";
import { TIME_ZONE } from "./utils.js";

// Every scheduler/API log line starts with a Sofia-local timestamp.
const stamp = () =>
    DateTime.now().setZone(TIME_ZONE).toFormat("yyyy-MM-dd HH:mm:ss.SSS");

export const logger = {
    info: (message: string) => console.log(`${stamp()} ${message}`),
    warn: (message: string) => console.warn(`${stamp()} WARN ${message}`),
    error: (message: string, ...details: unknown[]) =>
        console.error(`${stamp()} ERROR ${message}`, ...details),
};
