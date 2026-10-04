import { loadEnv } from "../../config.js";
import { VendorError } from "../../errors.js";
import { Vendor, Vendors } from "../vendor.js";

const env = loadEnv();

export class NtfyVendor extends Vendor {
    name = Vendors.Ntfy;

    async send(title: string, message: string): Promise<void> {
        const resp = await fetch(
            `https://ntfy.sh/${env.NTFY_TOPIC}`,
            {
                method: "POST",
                headers: {
                    Title: "GymBro | " + title,
                    Priority: "high",
                },
                body: message,
                signal: AbortSignal.timeout(10_000),
            },
        );

        if (!resp.ok) {
            throw new VendorError(`notification failed: ${resp.status}`, this.name);
        }
    }
}