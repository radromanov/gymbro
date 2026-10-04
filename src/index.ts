import { DateTime } from "luxon";
import { API } from "./api/index.js";
import { AppError } from "./errors.js";
import { getTimeInMs, getNextBookingDate, processFileLineByLine, sleep, TIME_ZONE, getSession } from "./utils.js";
import { NtfyVendor } from "./notifications/vendors/ntfy.js";
import { loadEnv } from "./config.js";

const env = loadEnv();

async function main() {
    // Load `skip-dates.txt` first
    // If NEXT is in `skip-dates.txt`, abort
    const next = getNextBookingDate();
    const skip = await processFileLineByLine("./skip-dates.txt", (s) => s === next);
    if (skip) {
        console.log(`Next date (${next}) is part of the "skip-dates.txt" file; aborting process...`)
        return;
    }

    // CRON job will have to install dependencies - it starts 5 minutes early
    // Once this script runs, login and get schedule
    const user = await API.Login();
    const me = await API.GetMe(user.accessToken);

    const schedule = await API.GetSchedule(user.accessToken);
    const session = getSession(schedule);

    // Determine if we need to wait until the provided `env.TIME_SLOT`
    const targetTimeInMs = getTimeInMs(env.TIME_SLOT);
    const nowInMs = DateTime.now().setZone(TIME_ZONE).toMillis();
    const diff = targetTimeInMs - nowInMs;
    if (diff > 0) {
        console.log(`Waiting ${diff}ms before slot opens up...`);
        await sleep(diff);
    }
    
    // Book here
    const bookData = await API.Book(user.accessToken, session, me.id);
    
    // Notifications
    const notif = new NtfyVendor();
    if ("message" in bookData) {
        await notif.send(
            "Session Not Booked",
            `Automated booking for ${session.date}, ${session.startTime} failed.\n\n${bookData.message}`,
        );
    } else {
        await notif.send(
            "Session Booked",
            `You have successfully booked your session for ${session.date}, ${session.startTime}.\n\nHappy lifting!`
        );
    }
}

main()
    .then(() => {
        console.log("success");
        process.exit(0);
    })
    .catch((e) => {
        if (e instanceof AppError) {
            console.log(e.name, e.toJSON());
        } else {
            console.log(e);
            console.log("unknown error");
        }
        process.exit(1);
    });
