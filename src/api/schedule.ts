import { DateTime } from "luxon";
import { ScheduleError } from "../errors.js";
import { ISchedule } from "./interfaces.js";
import { hit, NEXT_SLOT_DAYS, sleep, TIME_ZONE } from "../utils.js";
import { loadEnv } from "../config.js";
import { logger } from "../logger.js";

const env = loadEnv();

export const schedule = async (accessToken: string) => {
    const tomorrow = DateTime.now()
        .plus({ day: NEXT_SLOT_DAYS })
        .setZone(TIME_ZONE)
        .toISODate();
    logger.info(
        `Fetching schedule for ${DateTime.fromISO(tomorrow ?? "").toFormat("dd-MM-yyyy")}...`,
    );
    try {

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
        logger.info("Schedule fetched.");
        await sleep(3000);
        return data;
    } catch (e) {
        throw new ScheduleError("unable to obtain schedule");
    }
};
