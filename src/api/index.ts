import { book } from "./book.js";
import { login } from "./login.js";
import { me } from "./me.js";
import { schedule } from "./schedule.js";
import { sleep } from "./utils.js";

export const API = {
    Sleep: sleep,
    Login: login,
    GetMe: me,
    GetSchedule: schedule,
    Book: book,
};
