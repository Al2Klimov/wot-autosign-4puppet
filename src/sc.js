// For the terms of use see COPYRIGHT.md


const {Database} = require("sqlite3");
const {tempEvents} = require("./util");


module.exports = {
    net: {
        Server: {
            listen: function(...args) {
                return new Promise((resolve, reject) => {
                    let clear = tempEvents(this, {
                        listening: () => {
                            clear();
                            resolve();
                        },
                        error: err => {
                            clear();
                            reject(err);
                        }
                    });

                    this.listen(...args);
                });
            }
        }
    },

    sqlite3: {
        Database: {
            new: (...args) => new Promise((resolve, reject) => {
                let db = new Database(...args, err => {
                    if (err) {
                        reject(err);
                    } else {
                        resolve(db);
                    }
                });
            })
        }
    }
};
