export enum Vendors {
    Ntfy,
    None
};

export interface IVendor {
    name: Vendors;
    send(title: string, message: string): Promise<void>;
}

export abstract class Vendor implements IVendor {
    abstract readonly name: Vendors;

    abstract send(title: string, message: string): Promise<void>;
}