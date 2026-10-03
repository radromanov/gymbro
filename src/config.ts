import "dotenv/config";
import Type from "typebox";
import Schema from "typebox/schema";

const EnvSchema = Type.Object({
    API_URL: Type.String(),
    MYGYM_EMAIL: Type.String(),
    MYGYM_PASS: Type.String(),
    TENANT_ID: Type.String(),
    LOCATION_ID: Type.String(),
});

const EnvCompiler = Schema.Compile(EnvSchema);

export type Env = ReturnType<typeof EnvCompiler.Parse>;

export function loadEnv(): Env {
    return EnvCompiler.Parse(process.env);
}
