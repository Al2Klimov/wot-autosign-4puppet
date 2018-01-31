// For the terms of use see COPYRIGHT.md


const Mutex = require("./Mutex");
const {Promise: {all}} = require("./util");
const Service = require("./Service");


module.exports = class extends Service {
    constructor(services) {
        super();

        this.services = services;
        this.stateChangeMutex = new Mutex();
    }

    start() {
        return this.stateChangeMutex.enqueue(async () => {
            try {
                await all(this.services.map(service => service.start()));
            } catch (e) {
                await all(this.services.map(service => service.stop()));
                throw e;
            }
        });
    }

    stop() {
        return this.stateChangeMutex.enqueue(() => all(this.services.map(service => service.stop())));
    }
};
