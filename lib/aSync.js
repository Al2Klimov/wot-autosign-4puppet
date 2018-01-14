// For the terms of use see COPYRIGHT.md


const fs = require("fs");
const Semaphore = require("./Semaphore");
const util = require("./util");


let fsReadFileLimiter = new Semaphore(64);

exports.fs = {
    readFile: (...args) => fsReadFileLimiter.enqueue(() => new Promise((resolve, reject) => {
        fs.readFile(...args, (err, result) => {
            if (err) {
                reject(err);
            } else {
                resolve(result);
            }
        });
    })),
    
    readdir: (...args) => new Promise((resolve, reject) => {
        fs.readdir(...args, (err, result) => {
            if (err) {
                reject(err);
            } else {
                resolve(result);
            }
        });
    }),
    
    stat: (...args) => new Promise((resolve, reject) => {
        fs.stat(...args, (err, result) => {
            if (err) {
                reject(err);
            } else {
                resolve(result);
            }
        });
    })
};

exports.net = {
    Server: {
        listen: (server, ...args) => new Promise((resolve, reject) => {
            let clear = util.tempEvents(server, {
                listening: () => {
                    clear();
                    resolve();
                },
                error: err => {
                    clear();
                    reject(err);
                }
            });

            server.listen(...args);
        }),

        close: server => new Promise((resolve, reject) => {
            server.close(err => {
                if (err) {
                    reject(err);
                } else {
                    resolve();
                }
            });
        })
    }
};

exports.child_process = {
    wait: child => new Promise((resolve, reject) => {
        let clear = util.tempEvents(child, {
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

exports.stream = {
    readAll: stream => new Promise((resolve, reject) => {
        let result = [];

        let clear = util.tempEvents(stream, {
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
