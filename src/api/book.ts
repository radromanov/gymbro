import { BookError } from "../errors.js";
import { IBookResponse, IBookResponseTaken, ISlot } from "./interfaces.js";
import { hit } from "../utils.js";
import { IVendor } from "../notifications/vendor.js";

export const book = async (
    accessToken: string,
    session: ISlot,
    userId: number,
    notificationService: IVendor,
) => {
    try {
        console.log(
            `Attempting to book classDateId=${session.id} as userId=${userId}...`,
        );
        const data = await hit<IBookResponse | IBookResponseTaken>(
            "/class-bookings",
            "POST",
            {
                headers: [["Authorization", `Bearer ${accessToken}`]],
                body: {
                    classDateId: session.id,
                    userId,
                },
            },
        );

        if ("message" in data) {
            // send notification -- attach data.message
            await notificationService.send(
                "GymBro Booking (Fail)",
                `Attempted booking failed for session on ${session.date}.\n\nFail message: ${data.message}.`
            );
        } else {
            await notificationService.send(
                "GymBro Booking (Success)",
                `Attempted booking for session on ${session.date} successful.`
            );
        }
    } catch (e) {
        console.log(e);
        throw new BookError(`unable to book classDateId=${session.id}`);
    }
};
