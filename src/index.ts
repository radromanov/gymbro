import { DateTime } from "luxon";
import { API } from "./api/index.js";
import { AppError, SessionError } from "./errors.js";
import { getTimeInMs, getNextBookingDate, processFileLineByLine, sleep, TIME_ZONE } from "./utils.js";

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
    // If NEXT is in `skip-dates.txt`, abort
    const next = getNextBookingDate();
    const skip = await processFileLineByLine("./skip-dates.txt", (s) => s === next);
    if (skip) {
        console.log(`Next date (${next}) is part of the "skip-dates.txt" file; aborting process...`)
        return;
    }

    // Expects: npm run dev -- time={HH:MM}
    const [timeSlotRaw] = process.argv.slice(2);
    const timeSlot = timeSlotRaw.split("=")[1];

    // CRON job will have to install dependencies - it starts 5 minutes early
    // Once this script runs, login and get schedule
    const user = await API.Login();
    const me = await API.GetMe(user.accessToken);
    const schedule = await API.GetSchedule(user.accessToken);

    const session = schedule.data.find((s) => s.startTime.includes(timeSlot));
    if (!session) {
        throw new SessionError(`session for time ${timeSlot} not found`);
    }
    
    const nowInMs = DateTime.now().setZone(TIME_ZONE).toMillis();
    const targetTimeInMs = getTimeInMs(timeSlot);
    const diff = targetTimeInMs - nowInMs;

    if (diff > 0) {
        console.log("sleeping the difference first");
        await sleep(diff);
    }

    console.log("attempting to book");

    // Book here
    await API.Book(user.accessToken, session.id, me.id);
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
