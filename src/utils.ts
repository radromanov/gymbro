import fs from "fs";
import readline from "readline";
import { URLSearchParams } from "url";
import { loadEnv } from "./config.js";
import { AppError, MethodError } from "./errors.js";
import { DateTime } from "luxon";
import { ISchedule } from "./api/interfaces.js";

const DEFAULT_HEADERS: readonly [string, string][] = [
    ["Accept", "application/json, text/plain, */*"],
    ["Accept-Encoding", "gzip, deflate, br, zstd"],
    ["Accept-Language", "en-US,en;q=0.9"],
    ["Bypass-Tunnel-Reminder", "*"],
    ["Content-Type", "application/json"],
    ["Origin", "https://app.octivfitness.com"],
    ["Referrer", "https://app.octivfitness.com"],
    ["Priority", "u=1, i"],
    [
        "Sec-Ch-Ua",
        '"Chromium";v="148", "Google Chrome";v="148", "Not/A)Brand";v="99"',
    ],
    ["Sec-Ch-Ua-Mobile", "?0"],
    ["Sec-Ch-Ua-Platform", '"Windows"'],
    ["Sec-Fetch-Dest", "empty"],
    ["Sec-Fetch-Mode", "cors"],
    ["Sec-Fetch-Site", "same-site"],
    [
        "User-Agent",
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/148.0.0.0 Safari/537.36",
    ],
    ["X-Camelcase", "true"],
    // ["Content-Length", "83"],
];

export const NEXT_SLOT_DAYS = 14;
export const TIME_ZONE = "Europe/Sofia";

const env = loadEnv();

export const hit = async <T>(
    endpoint: string,
    method: string,
    opts?: {
        body?: Record<string, any>;
        headers?: [string, string][];
        queryparams?: Record<string, string>;
    },
): Promise<T> => {
    if (method !== "GET" && method !== "POST" && method !== "PUT") {
        throw new MethodError("unknown method. Allowed: GET, POST, PUT");
    }

    const injectHeaders = opts?.headers || [];

    if (method === "GET") {
        const injectQueryParams = opts?.queryparams
            ? "?" + new URLSearchParams(opts.queryparams)
            : "";

        const resp = await fetch(env.API_URL + endpoint + injectQueryParams, {
            method,
            headers: [...DEFAULT_HEADERS, ...injectHeaders],
        });
        const data = (await resp.json()) as T;
        return data;
    }

    const injectBody = opts?.body || undefined;

    const resp = await fetch(env.API_URL + endpoint, {
        method,
        body: JSON.stringify(injectBody),
        headers: [...DEFAULT_HEADERS, ...injectHeaders],
    });
    const data = (await resp.json()) as T;
    return data;
};

export const sleep = (ms: number) => {
    return new Promise((resolve) => setTimeout(resolve, ms));
};

export const getNextBookingDate = (): string => {
    const next = DateTime.now()
        .setZone(TIME_ZONE)
        .plus({ days: NEXT_SLOT_DAYS });

    return next.toFormat("dd-MM-yyyy");
};

/**
 * @param time HH:MM format.
 * @returns `time` in milliseconds (today).
 */
export const getTimeInMs = (time: string) => {
    const match = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(time);
    if (!match) {
        throw new AppError(`invalid time format in getTimeInMs: ${time}. Must be in HH:MM format.`)
    }
    const [, hour, minute] = match;
    const target = DateTime.now()
        .setZone(TIME_ZONE)
        .set({
            hour: Number(hour),
            minute: Number(minute),
            second: 0,
            millisecond: 0,
        });
    return target.toMillis();
}

export function getSlotForNow(): string {
    const now = DateTime.now().setZone(TIME_ZONE);

    // EET = UTC+2 -> 18:00 / 18:30
    // EEST = UTC+3 -> 19:00 / 19:30
    return now.isInDST ? "19:00" : "18:00";
}

/**
 * 
 * @param filepath Path relative to project root.
 * @param callback Filtering function. If result is `true`, this function returns `true`.
 * @returns Boolean. `true` is `callback(s)` is satisfied; `false` otherwise.
 */
export const processFileLineByLine = async (filepath: string, callback: (s: string) => boolean) => {
    const fileStream = fs.createReadStream(filepath);
    const rl = readline.createInterface({
        input: fileStream,
        crlfDelay: Infinity,
    });


    for await (const line of rl) {
        if (line.includes("#") || line === "") {
            continue;
        }
        const cleaned = line.trim();

        if (callback(cleaned)) {
            return true;
        }
    }
    return false;
}

export const getSession = (schedule: ISchedule, timeSlot: string) => {
    // Calculate the session index instead of searching for the session
    const [hour, minute] = timeSlot.split(":").map(Number);

    let idx = hour * 2;
    if (minute !== 0) {
        idx += 1; // move the idx by 1 to get the `*:30` session
    }
    
    return schedule.data[idx];
}