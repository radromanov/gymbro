import { API } from "./api/index.js";
import { AppError } from "./errors.js";

async function main() {
    const user = await API.Login();
    const me = await API.Me(user.accessToken);
    console.log(me.id);
}

main()
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
