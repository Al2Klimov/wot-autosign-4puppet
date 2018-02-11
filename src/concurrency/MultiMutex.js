// For the terms of use see COPYRIGHT.md


const MultiSemaphore = require("./MultiSemaphore");


module.exports = class extends MultiSemaphore {
    constructor() {
        super(1);
    }
};
