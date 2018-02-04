// For the terms of use see COPYRIGHT.md


const {mkdtemp, readdir, readFile, rename, rmdir, stat, unlink} = require("fs");
const {Server: {prototype: {close: httpsServerClose}}} = require("https");
const {Database} = require("sqlite3");


module.exports = {
    fs: {
        mkdtemp: promisify(mkdtemp),
        readdir: promisify(readdir),
        readFile: promisify(readFile),
        rename: promisify(rename),
        rmdir: promisify(rmdir),
        stat: promisify(stat),
        unlink: promisify(unlink)
    },

    https: {
        Server: {
            close: promisify(httpsServerClose)
        }
    },

    sqlite3: {
        Database: {
            close: promisify(Database.prototype.close),
            run: promisify(Database.prototype.run),
            get: promisify(Database.prototype.get)
        }
    }
};

function promisify(f) {
    return function(...args) {
        return new Promise((resolve, reject) => {
            f.bind(this)(...args, (error, result) => {
                if (error) {
                    reject(error);
                } else {
                    resolve(result);
                }
            });
        });
    };
}
