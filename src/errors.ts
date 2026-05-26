export class AppError extends Error {
    constructor(message: string) {
        super(message);
        this.name = "AppError";
        Object.setPrototypeOf(this, AppError.prototype);
    }

    toJSON() {
        return {
            name: this.name,
            message: this.message,
            stack: this.stack,
        };
    }
}

export class MethodError extends AppError {
    constructor(message: string) {
        super(message);
        this.name = "MethodError";
    }
}

export class LoginError extends AppError {
    constructor(message: string) {
        super(message);
        this.name = "LoginError";
    }
}

export class SessionError extends AppError {
    constructor(message: string) {
        super(message);
        this.name = "SessionError";
    }
}

export class ScheduleError extends AppError {
    constructor(message: string) {
        super(message);
        this.name = "ScheduleError";
    }
}

export class BookError extends AppError {
    constructor(message: string) {
        super(message);
        this.name = "BookError";
    }
}
