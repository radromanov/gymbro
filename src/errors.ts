export class LoginError extends Error {
    constructor(message: string, cause: unknown) {
        super(message);
        this.name = "LoginError";
        this.cause = cause;
    }
}

export class BookError extends Error {
    constructor(message: string, cause: unknown) {
        super(message);
        this.name = "BookError";
        this.cause = cause;
    }
}
