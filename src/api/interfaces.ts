/** Plain; no hashing */
export interface ILoginPayload {
    username: string; // email
    password: string;
}

export interface ILoginResponse {
    tokenType: string; // "Bearer"
    expiresIn: number;
    accessToken: string;
    refreshToken: string;
    mergeAccount: boolean; // false after login
}

export interface IMeResponse {
    /** userId */
    id: number;
}

export interface IBookPayload {
    /** `ISlot.id` */
    classDateId: number;
    /** `IMeResponse.id` */
    userId: number;
}

export interface IBookResponse {
    class: IClass;
    status: {
        /** 1 if success; "waiting" if in waiting list/queue */
        id: number | string; //
        /** "BOOKED" if success; "WAITING" if in waiting list/queue given session is already booked */
        name: string; //
    };
}

export interface IBookResponseTaken {
    message: string;
}

export interface IClass {
    id: number;
    limit: number;
    /** e.g., "2026-05-26 01:00:00" */
    startTime: string;
    /** e.g., "2026-05-26 01:30:00" */
    endTime: string;
}

export interface ISlot {
    /** slot id; needed when sending book request */
    id: number;

    /** bookings limit, always 1 */
    limit: number;

    /** YYYY-MM-DD format -- e.g., 2026-05-27 */
    date: string;

    /** HH-MM-SS format -- e.g., 00:00:00 */
    startTime: string;

    /** HH-MM-SS format -- e.g., 00:30:00. Always 30 minutes after `startTime` */
    endTime: string;

    /** 0 or 1 -- 0 if no bookings; 1 if booked */
    bookingsCount: number;

    /** YYYY-MM-DD format -- e.g., 2026-05-27 */
    bookingThresholdDate: string;

    /** HH-MM-SS format -- e.g., 23:59:00 */
    bookingThresholdTime: string;

    /** number of queued people for this session in case of cancellation (first-come-first-served) */
    waitingListCount: number;
}

export interface ISchedule {
    /** 48 entries always */
    data: ISlot[];
}
