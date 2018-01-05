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

function callbackFactory(resolve, reject) {
    return (err, result) => {
        if (err) {
            reject(err);
        } else {
            resolve(result);
        }
    };
}
