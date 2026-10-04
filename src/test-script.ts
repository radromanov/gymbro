import { AppError } from "./errors.js";

async function test() {
    console.log("I have been ran");
    console.log("Incoming arguments:", process.argv);
    console.log("Env:", process.env);
}

test()
    .then(() => {
        console.log("success");
        process.exit(0);
    })
    .catch((e) => {
        if (e instanceof AppError) {
            console.log(e.name, e.toJSON());
        } else {
            console.log("unknown error");
        }
        process.exit(1);
    });
