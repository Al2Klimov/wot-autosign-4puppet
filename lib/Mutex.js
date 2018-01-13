// For the terms of use see COPYRIGHT.md


const Semaphore = require("./Semaphore");


module.exports = class extends Semaphore {
    constructor() {
        super(1);
    }
};
