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

exports.Promise = {
    all: promises => new Promise((resolve, reject) => {
        let results = promises.map(() => undefined), error = null, remain = promises.length;

        promises.forEach((promise, i) => {
            promise.then(
                result => {
                    results[i] = result;
                    done1();
                },
                reason => {
                    if (error === null) {
                        error = reason;
                    }

                    done1();
                }
            );
        });

        function done1() {
            if (--remain === 0) {
                if (error === null) {
                    resolve(results);
                } else {
                    reject(error);
                }
            }
        }
    })
};
