// For the terms of use see COPYRIGHT.md


const Mutex = require("../concurrency/Mutex");
const RingLinkedList = require("../util/RingLinkedList");
const Service = require("./Service");


module.exports = class extends Service() {
    constructor() {
        super();

        this.pendingTimers = null;
        this.stateChangeMutex = new Mutex();
    }

    start() {
        return this.stateChangeMutex.enqueue(async () => {
            if (this.pendingTimers === null) {
                this.pendingTimers = new RingLinkedList;
            }
        });
    }

    stop() {
        return this.stateChangeMutex.enqueue(async () => {
            if (this.pendingTimers !== null) {
                for (let pendingTimer of this.pendingTimers.iter()) {
                    clearTimeout(pendingTimer.value);
                }

                this.pendingTimers = null;
            }
        });
    }

    setTimeout(f, delay, ...args) {
        if (this.pendingTimers !== null) {
            let pendingTimer = this.pendingTimers.append(setTimeout(
                () => {
                    pendingTimer.detach();
                    f(...args);
                },
                delay
            ));
        }
    }
};
