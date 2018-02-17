// For the terms of use see COPYRIGHT.md


const Mutex = require("../concurrency/Mutex");
const {Promise: {all}} = require("../util/misc");


module.exports = class {
    constructor(services, dependencies) {
        this.services = services;
        this.dependencies = dependencies || {};
        this.reverseDependencies = {};
        this.stateChangeMutex = new Mutex();

        for (let service in this.services) {
            if (typeof this.dependencies[service] === "undefined") {
                this.dependencies[service] = [];
            }

            this.reverseDependencies[service] = [];
        }

        for (let service in this.services) {
            for (let dependency of this.dependencies[service]) {
                this.reverseDependencies[dependency].push(service);
            }
        }
    }

    start() {
        return this.stateChangeMutex.enqueue(async () => {
            let tasks = {};
            let allTasks = [];

            let nextEventLoopRound = new Promise(resolve => {
                setTimeout(resolve, 0);
            });

            let start = async service => {
                await nextEventLoopRound;

                for (let dependency of this.dependencies[service]) {
                    await tasks[dependency];
                }

                await this.services[service].start();
            };

            for (let service in this.services) {
                allTasks.push(tasks[service] = start(service));
            }

            try {
                await all(allTasks);
            } catch (e) {
                await stop.call(this);
                throw e;
            }
        });
    }

    stop() {
        return this.stateChangeMutex.enqueue(stop.bind(this));
    }
};

async function stop() {
    let tasks = {};
    let allTasks = [];

    let nextEventLoopRound = new Promise(resolve => {
        setTimeout(resolve, 0);
    });

    let stop = async service => {
        await nextEventLoopRound;

        for (let dependency of this.reverseDependencies[service]) {
            try {
                await tasks[dependency];
            } catch (e) {
            }
        }

        await this.services[service].stop();
    };

    for (let service in this.services) {
        allTasks.push(tasks[service] = stop(service));
    }

    await all(allTasks);
}
