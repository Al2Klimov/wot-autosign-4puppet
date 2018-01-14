// For the terms of use see COPYRIGHT.md


const Mutex = require("./Mutex");
const Service = require("./Service");
const util = require("./util");


module.exports = class extends Service {
    constructor(services) {
        super();

        this.services = services;
        this.stateChangeMutex = new Mutex();
    }

    start() {
        return this.stateChangeMutex.enqueue(async () => {
            try {
                await Promise.all(this.services.map(service => service.start()));
            } catch (e) {
                await Promise.all(this.services.map(service => service.stop()));
                throw e;
            }
        });
    }

    stop() {
        return this.stateChangeMutex.enqueue(() => Promise.all(this.services.map(service => service.stop())));
    }
};
