import { DateTime } from "luxon";
import { API } from "./api/index.js";
import { AppError } from "./errors.js";
import { getTimeInMs, getTomorrow, processFileLineByLine, sleep, TIME_ZONE } from "./utils.js";

/**
 * We will assume that the next 13 days are booked accordingly
 * and that we only need to book TODAY's sessions.
 *
 * This program needs to run at 18:55 so we ensure the pre-booking sequence (Login, Me, and GetDate) completes.
 *
 * Once the pre-booking sequence is complete,
 * it waits until 19:00 Europe/Sofia (Summer-time) / 18:00 Europe/Sofia (Winter-time),
 * proceeds to fire the first booking request.
 *
 * If the session doesn't book successfully (e.g., slot full, package has no sessions),
 * proceed to send email notification with summary of attempt (date, slot, etc.).
 *
 * (Below might be a separate script/runner)
 * If our package needs "topping up" for TOMORROW's bookings, alert me via email.
 *  - To find that our, at 03:00:00 each day, attempt to book one session
 *    If not possible, send me email notification
 */

async function main() {
    // Load `skip-dates.txt` first
    // If TOMORROW is in `skip-dates.txt`, abort
    const tomorrow = getTomorrow();
    const skip = await processFileLineByLine("./skip-dates.txt", (s) => s === tomorrow);
    if (skip) {
        console.log(`Tomorrow's date (${tomorrow}) is part of the "skip-dates.txt" file; aborting process...`)
        return;
    }

    // CRON job will have to install dependencies - it starts 5 minutes early
    // Once this script runs, login and get schedule
    const user = await API.Login();
    const me = await API.GetMe(user.accessToken);
    const schedule = await API.GetSchedule(user.accessToken);
    
    const nowInMs = DateTime.now().setZone(TIME_ZONE).toMillis();
    const targetTimeInMs = getTimeInMs("18:00");
    const diff = targetTimeInMs - nowInMs;
    if (diff < 0) {
        // Attempt to book immediately
        console.log("attempting to book immediately");
        return;
    }

    console.log("sleeping the difference first");
    await sleep(diff);
    // Book here
    console.log("attempting to book");

    // Then, `sleep(targetTimeInMs - currentTimeInMs)` - sleep until our target time
    // Once `sleep(...)` finishes, book and finish job
    //
    // This script will book ONE session only, so we will receive the session via CLI args passed by the GitHub action?

    // Sessions 36 and 37 are safe to obtain always -- no need to loop over
    // Those are our target sessions
    // const sessionOne = schedule.data[36];
    // const sessionTwo = schedule.data[37];
    // await API.Book(user.accessToken, sessionOne.id, me.id);
    // 1 min = 60000ms
    // Session intervals = 30 minutes
    // 60000ms * 30 = 30 minutes in ms
    // await sleep(60000 * 30);
    // await API.Book(user.accessToken, sessionTwo.id, me.id);
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
