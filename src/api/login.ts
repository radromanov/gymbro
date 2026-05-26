import { loadEnv } from "../config.js";
import { LoginError } from "../errors.js";
import { ILoginResponse } from "./interfaces.js";
import { DEFAULT_HEADERS } from "./utils.js";

const env = loadEnv();

export const login = async () => {
    try {
        const resp = await fetch(URL + "/login", {
            body: JSON.stringify({
                username: env.MYGYM_EMAIL,
                password: env.MYGYM_PASS,
            }),
            method: "POST",
            headers: [...DEFAULT_HEADERS, ["Content-Length", "83"]],
        });
        const data = (await resp.json()) as ILoginResponse;
        console.log(data);
    } catch (e) {
        console.log("Login error", e);
        throw new LoginError("login failed", e);
    }
};
