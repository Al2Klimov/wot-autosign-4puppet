// For the terms of use see COPYRIGHT.md


type LogMessage = Error | { toString(): string; } | string;
type LogMessageFactory = (() => LogMessage) | LogMessage;

const levels = {
    critical: 1,
    error: 2,
    warning: 3,
    info: 4,
    debug: 5
};

export class Logger {
    private level: number;

    public constructor(level: "critical" | "error" | "warning" | "info" | "debug") {
        this.level = levels[level];
    }

    public critical(message: LogMessageFactory): void {
        this.log(levels.critical, message);
    }

    public error(message: LogMessageFactory): void {
        this.log(levels.error, message);
    }

    public warning(message: LogMessageFactory): void {
        this.log(levels.warning, message);
    }

    public info(message: LogMessageFactory): void {
        this.log(levels.info, message);
    }

    public debug(message: LogMessageFactory): void {
        this.log(levels.debug, message);
    }

    private log(level: number, message: LogMessageFactory): void {
        if (level <= this.level) {
            if (typeof message === "function") {
                message = message();
            }

            if (typeof message === "object" && ! (message instanceof Error)) {
                message = message.toString();
            }

            console.log(message);
        }
    }
}
