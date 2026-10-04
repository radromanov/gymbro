import { loadEnv } from "../config.js";
import { LoginError } from "../errors.js";
import { ILoginResponse } from "./interfaces.js";
import { hit, sleep } from "../utils.js";

const env = loadEnv();

export const login = async () => {
    console.log("Attempting login...");
    try {
        const data = await hit<ILoginResponse>("/login", "POST", {
            body: { username: env.MYGYM_EMAIL, password: env.MYGYM_PASS },
            headers: [["Content-Length", "83"]],
        });
        console.log("Login successful!");
        await sleep(3000);
        return data;
    } catch (e) {
        throw new LoginError("login failed");
    }
};
