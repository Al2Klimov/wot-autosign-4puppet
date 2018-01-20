// For the terms of use see COPYRIGHT.md


const fs = require("fs");
const Semaphore = require("./Semaphore");


module.exports = () => {
    fs.readFile = (() => {
        const {readFile} = fs;

        let fsReadFileLimiter = new Semaphore(64);

        return (...args) => {
            fsReadFileLimiter.enqueue(() => new Promise(resolve => {
                let callback = args.pop();

                readFile(...args, (...args) => {
                    resolve();
                    return callback(...args);
                });
            }));
        };
    })();

    Promise.all = promises => new Promise((resolve, reject) => {
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
    });
};
