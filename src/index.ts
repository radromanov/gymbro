import { API } from "./api/index.js";
import { AppError } from "./errors.js";

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
 * If the first session doesn't book successfully (e.g., slot full, package has no sessions),
 * proceed to send email notification with summary of attempt (date, slot, etc.).
 *
 * If the first session books successfully, queue the next (30 minutes after first).
 *
 * If sessions <= 6, send email notification on each successful booking to alert me.
 *
 * If our package needs "topping up" for TOMORROW's bookings, alert me via email.
 *  - To find that our, at 00:00:00 each day, attempt to book one session
 *    If not possible, send me email notification
 */

async function main() {
    const user = await API.Login();
    // const me = await API.GetMe(user.accessToken);

    // Index 36 and 37 are safe to obtain always -- no need to loop over
    // const schedule = await API.GetDate(user.accessToken, "2026-05-27");

    // const sessionOne = schedule.data[36];
    // const sessionTwo = schedule.data[37];

    // // Pseudo logic
    // const targetTime = 19:00:00
    // const currentTime = Date.now();
    // const delta = targetTime - currentTime;
    // await API.Sleep(delta);
    // await API.Book(sessionOne);

    // const targetTime2 = 19:30:00;
    // const currentTime2 = Date.now();
    // const delta2 = targetTime2 - currentTime2;
    // await API.Sleep(delta2);
    // await API.Book(sessionTwo);
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
            console.log("unknown error");
        }
        process.exit(1);
    });
