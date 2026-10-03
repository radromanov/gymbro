import { DateTime } from "luxon";
import { ScheduleError } from "../errors.js";
import { ISchedule } from "./interfaces.js";
import { hit, sleep } from "./utils.js";
import { loadEnv } from "../config.js";

const env = loadEnv();

export const schedule = async (accessToken: string) => {
    console.log("Attempting to get schedule...");
    try {
        const tomorrow = DateTime.now()
            .plus({ day: 1 })
            .setZone("Europe/Sofia")
            .toISODate();

        const data = await hit<ISchedule>("/class-dates", "GET", {
            headers: [["Authorization", `Bearer ${accessToken}`]],
            queryparams: {
                include: "classBookings,classBookingWaitingList",
                "filter[tenantId]": env.TENANT_ID,
                "filter[locationId]": env.LOCATION_ID,
                "filter[between]": `${tomorrow},${tomorrow}`,
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
