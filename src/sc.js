// For the terms of use see COPYRIGHT.md


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
    }
};
