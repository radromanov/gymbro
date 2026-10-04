import { BookError } from "../errors.js";
import { IBookResponse, IBookResponseTaken } from "./interfaces.js";
import { hit } from "../utils.js";

export const book = async (
    accessToken: string,
    classDateId: number,
    userId: number,
) => {
    try {
        console.log(
            `Attempting to book classDateId=${classDateId} as userId=${userId}...`,
        );
        const data = await hit<IBookResponse | IBookResponseTaken>(
            "/class-bookings",
            "POST",
            {
                headers: [["Authorization", `Bearer ${accessToken}`]],
                body: {
                    classDateId,
                    userId,
                },
            },
        );

        if ("message" in data) {
            // send notification -- attach data.message
        }
    } catch (e) {
        console.log(e);
        throw new BookError(`unable to book classDateId=${classDateId}`);
    }
};
