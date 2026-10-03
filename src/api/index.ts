import { book } from "./book.js";
import { login } from "./login.js";
import { me } from "./me.js";
import { schedule } from "./schedule.js";

export const API = {
    Login: login,
    GetMe: me,
    GetSchedule: schedule,
    Book: book,
};
