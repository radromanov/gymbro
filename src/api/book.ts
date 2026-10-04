import { BookError } from "../errors.js";
import { IBookResponse, IBookResponseTaken, ISlot } from "./interfaces.js";
import { hit } from "../utils.js";

export const book = async (
    accessToken: string,
    session: ISlot,
    userId: number,
) => {
    try {
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

        return data;
    } catch (e) {
        console.log(e);
        throw new BookError(`unable to book classDateId=${session.id}`);
    }
};
