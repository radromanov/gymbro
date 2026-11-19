import { DateTime } from "luxon";
import { ScheduleError } from "../errors.js";
import { ISchedule } from "./interfaces.js";
import { hit, sleep } from "../utils.js";
import { loadEnv } from "../config.js";
import { logger } from "../logger.js";

const env = loadEnv();

/** @param date Booking date, `yyyy-MM-dd` (the caller's single source of truth). */
export const schedule = async (accessToken: string, date: string) => {
    logger.info(
        `Fetching schedule for ${DateTime.fromISO(date).toFormat("dd-MM-yyyy")}...`,
    );
    try {

        const data = await hit<ISchedule>("/class-dates", "GET", {
            headers: [["Authorization", `Bearer ${accessToken}`]],
            queryparams: {
                include: "classBookings,classBookingWaitingList",
                "filter[tenantId]": env.TENANT_ID,
                "filter[locationId]": env.LOCATION_ID,
                "filter[between]": `${date},${date}`,
                "filter[isSession]": "1",
                internalAppend: "withoutLocations",
                perPage: "-1",
            },
        });
        logger.info("Schedule fetched.");
        await sleep(3000);
        return data;
    } catch (e) {
        throw new ScheduleError("unable to obtain schedule");
    }
};
