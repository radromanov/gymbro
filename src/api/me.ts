import { SessionError } from "../errors.js";
import { IMeResponse } from "./interfaces.js";
import { hit, sleep } from "../utils.js";
import { logger } from "../logger.js";

export const me = async (accessToken: string) => {
    logger.info("Fetching profile...");
    try {
        const data = await hit<IMeResponse>("/users/me", "GET", {
            headers: [["Authorization", `Bearer ${accessToken}`]],
        });
        logger.info("Profile fetched.");
        await sleep(3000);
        return data;
    } catch (e) {
        throw new SessionError("session/me failed");
    }
};
