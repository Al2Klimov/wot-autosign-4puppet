// For the terms of use see COPYRIGHT.md


const fs = require("fs");
const Semaphore = require("./Semaphore");
const util = require("./util");


let originals = {
    fs: {readFile: fs.readFile},
    Promise: {all: Promise.all}
};

let wrappers = {
    fs: {readFile: (...args) => {
        fsReadFileLimiter.enqueue(() => util.Promisify(originals.fs.readFile, ...args));
    }},

    Promise: {all: promises => new Promise((resolve, reject) => {
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
    })}
};

let fsReadFileLimiter = new Semaphore(64);

module.exports = () => {
    fs.readFile = wrappers.fs.readFile;
    Promise.all = wrappers.Promise.all;

    return unhack;
};

function unhack() {
    fs.readFile = originals.fs.readFile;
    Promise.all = originals.Promise.all;
}
