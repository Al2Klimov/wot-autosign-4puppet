// For the terms of use see COPYRIGHT.md


const fs = require("fs");


exports.fs = {
    readFile: (...args) => new Promise((resolve, reject) => {
        // TODO: limit parallel readings
        fs.readFile(...args, callbackFactory(resolve, reject));
    }),
    
    readdir: (...args) => new Promise((resolve, reject) => {
        fs.readdir(...args, callbackFactory(resolve, reject));
    }),
    
    stat: (...args) => new Promise((resolve, reject) => {
        fs.stat(...args, callbackFactory(resolve, reject));
    })
};

exports.child_process = {
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
};

exports.stream = {
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
            }

            resolve(null);
        }
    })
};

function callbackFactory(resolve, reject) {
    return (err, result) => {
        if (err) {
            reject(err);
        } else {
            resolve(result);
        }
    };
}

function tempEvents(emitter, events) {
    for (let event in events) {
        emitter.on(event, events[event]);
    }

    return () => {
        for (let event in events) {
            emitter.removeListener(event, events[event]);
        }
    };
}
