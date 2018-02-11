// For the terms of use see COPYRIGHT.md


const Semaphore = require("../concurrency/Semaphore");
const {fs: {readFile}} = require("./promisified");


module.exports = {
    child_process: {
        wait: child => new Promise((resolve, reject) => {
            let clear = tempEvents(child, {
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
    },

    fs: {
        readFile: (() => {
            let fsReadFileLimiter = new Semaphore(64);

            return (...args) => fsReadFileLimiter.enqueue(() => readFile(...args));
        })()
    },

    middleware: {
        fromPromiseFactory: f => (req, res, next) => {
            f(req, res, next).catch(reason => next(reason));
        },

        handleErrors: (middleware, errorHandler) => (req, res, next) => {
            middleware(req, res, (err, ...args) => {
                if (err instanceof Error) {
                    errorHandler(err, req, res, next);
                } else {
                    next(err, ...args);
                }
            });
        }
    },

    Promise: {
        all: promises => new Promise((resolve, reject) => {
            promises = Array.from(promises);

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
        }),

        ultimaRatio: err => {
            setTimeout(() => {
                throw err;
            }, 0);
        }
    },

    stream: {
        readAll: stream => new Promise((resolve, reject) => {
            let result = [];

            let clear = tempEvents(stream, {
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
    },

    tempEvents: (emitter, events) => {
        for (let event in events) {
            emitter.on(event, events[event]);
        }

        return () => {
            for (let event in events) {
                emitter.removeListener(event, events[event]);
            }
        };
    }
};

let tempEvents = module.exports.tempEvents;
