// For the terms of use see COPYRIGHT.md


const util = require("./util");


module.exports.net = {Server: {listen: (server, ...args) => {
    let callback = args.pop();

    let clear = util.tempEvents(server, {
        listening: () => {
            clear();
            callback(null);
        },
        error: err => {
            clear();
            callback(err);
        }
    });

    server.listen(...args);
}}};
