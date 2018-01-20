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

exports.child_process = {
    wait: child => new Promise((resolve, reject) => {
        let clear = exports.tempEvents(child, {
            exit: (code, signal) => {
                clear();

                if (signal === null) {
                    if (code === 0) {
                        resolve();
                    } else {
                        reject(new Error("Child process " + child.pid + " exited with " + code + "(expected: 0)"));
                    }
                } else {
                    reject(new Error("Child process " + child.pid + " was terminated by " + signal));
                }
            },
            error: err => {
                clear();
                reject(err);
            }
        });
    })
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
    ultimaRatio: err => {
        setTimeout(() => {
            throw err;
        }, 0);
    }
};

exports.stream = {
    readAll: stream => new Promise((resolve, reject) => {
        let result = [];

        let clear = exports.tempEvents(stream, {
            data: chunk => {
                result.push(chunk);
            },
            end: onEnd,
            error: err => {
                clear();
                reject(err);
            },
            close: onEnd,
        });

        function onEnd() {
            clear();

            if (result.length) {
                resolve(result[0] instanceof Buffer ? Buffer.concat(result) : result.join());
            } else {
                resolve(null);
            }
        }
    })
};
