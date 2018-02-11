// For the terms of use see COPYRIGHT.md


const levels = {
    critical: 1,
    error: 2,
    warning: 3,
    info: 4,
    debug: 5
};

module.exports = class {
    constructor(level) {
        this.level = levels[level];
    }

    log(level, message) {
        if (level <= this.level) {
            if (typeof message === "function") {
                message = message();
            }

            if (typeof message === "object") {
                message = message.toString();
            }

            console.log(message);
        }
    }

    critical(message) {
        this.log(levels.critical, message);
    }

    error(message) {
        this.log(levels.error, message);
    }

    warning(message) {
        this.log(levels.warning, message);
    }

    info(message) {
        this.log(levels.info, message);
    }

    debug(message) {
        this.log(levels.debug, message);
    }
};
