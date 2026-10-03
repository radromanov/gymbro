import { URLSearchParams } from "url";
import { loadEnv } from "../config.js";
import { MethodError } from "../errors.js";

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
