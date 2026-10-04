import "dotenv/config";
import Type from "typebox";
import Schema from "typebox/schema";

const EnvSchema = Type.Object({
    API_URL: Type.String(),
    MYGYM_EMAIL: Type.String(),
    MYGYM_PASS: Type.String(),
    TENANT_ID: Type.String(),
    LOCATION_ID: Type.String(),
    NTFY_TOPIC: Type.String(),
    TIME_SLOT: Type.String(),
});

const EnvCompiler = Schema.Compile(EnvSchema);

export function loadEnv() {
    const env = EnvCompiler.Parse(process.env);
    return {
        // Can parse numbers/booleans here
        ...env,
    }
}
