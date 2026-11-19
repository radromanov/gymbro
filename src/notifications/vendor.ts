export enum Vendors {
    Ntfy,
    None
};

export type Priority = "low" | "default" | "high";

export interface IVendor {
    name: Vendors;
    send(title: string, message: string, priority?: Priority): Promise<void>;
}

export abstract class Vendor implements IVendor {
    abstract readonly name: Vendors;

    abstract send(
        title: string,
        message: string,
        priority?: Priority,
    ): Promise<void>;
}