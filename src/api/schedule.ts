import { ScheduleError } from "../errors.js";
import { ISchedule } from "./interfaces.js";
import { hit, sleep } from "./utils.js";

export const schedule = async (accessToken: string, date: string) => {
    console.log("Attempting to get schedule...");
    try {
        const data = await hit<ISchedule>("/class-dates", "GET", {
            headers: [["Authorization", `Bearer ${accessToken}`]],
            queryparams: {
                include: "classBookings,classBookingWaitingList",
                "filter[tenantId]": "102880",
                "filter[locationId]": "2741",
                "filter[between]": `${date},${date}`,
                "filter[isSession]": "1",
                internalAppend: "withoutLocations",
                perPage: "-1",
            },
        });
        await sleep(3000);
        console.log("Schedule obtained successfully!");
        return data;
    } catch (e) {
        throw new ScheduleError("unable to obtain schedule");
    }
};
