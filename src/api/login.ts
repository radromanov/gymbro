import { loadEnv } from "../config.js";
import { LoginError } from "../errors.js";
import { ILoginResponse } from "./interfaces.js";
import { hit } from "./utils.js";

const env = loadEnv();

export const login = async () => {
    try {
        return await hit<ILoginResponse>("/login", "POST", {
            body: { username: env.MYGYM_EMAIL, password: env.MYGYM_PASS },
            headers: [["Content-Length", "83"]],
        });
    } catch (e) {
        throw new LoginError("login failed");
    }
};
