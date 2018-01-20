// For the terms of use see COPYRIGHT.md


const {readdir, readFile, stat} = require("fs");
const {Server: {prototype: {close: httpsServerClose}}} = require("https");


module.exports = {
    fs: {
        readdir: promisify(readdir),
        readFile: promisify(readFile),
        stat: promisify(stat)
    },

    https: {
        Server: {
            close: promisify(httpsServerClose)
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
