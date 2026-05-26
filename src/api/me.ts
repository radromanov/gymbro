import { SessionError } from "../errors.js";
import { IMeResponse } from "./interfaces.js";
import { hit } from "./utils.js";

export const me = async (accessToken: string) => {
    try {
        return await hit<IMeResponse>("/users/me", "GET", {
            headers: [["Authorization", `Bearer ${accessToken}`]],
        });
    } catch (e) {
        throw new SessionError("session/me failed");
    }
};
