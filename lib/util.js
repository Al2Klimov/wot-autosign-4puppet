// For the terms of use see COPYRIGHT.md


exports.tempEvents = (emitter, events) => {
    for (let event in events) {
        emitter.on(event, events[event]);
    }

    return () => {
        for (let event in events) {
            emitter.removeListener(event, events[event]);
        }
    };
};

exports.middleware = {
    handleErrors: (middleware, errorHandler) => (req, res, next) => {
        middleware(req, res, (err, ...args) => {
            if (err instanceof Error) {
                errorHandler(err, req, res, next);
            } else {
                next(err, ...args);
            }
        });
    }
};
