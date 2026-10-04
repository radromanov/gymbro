import { SessionError } from "../errors.js";
import { IMeResponse } from "./interfaces.js";
import { hit, sleep } from "../utils.js";

export const me = async (accessToken: string) => {
    console.log("Attempting me...");
    try {
        const data = await hit<IMeResponse>("/users/me", "GET", {
            headers: [["Authorization", `Bearer ${accessToken}`]],
        });
        await sleep(3000);
        console.log("Me succesful!");
        return data;
    } catch (e) {
        throw new SessionError("session/me failed");
    }
};
