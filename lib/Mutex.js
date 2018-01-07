// For the terms of use see COPYRIGHT.md


module.exports = class {
    constructor() {
        this.queue = null;
    }

    lock() {
        return new Promise(resolve => {
            if (this.queue === null) {
                this.queue = [];
                resolve(unlockFactory(this));
            } else {
                this.queue.push(resolve);
            }
        });
    }

    async enqueue(task) {
        let unlock = await this.lock(), result;

        try {
            result = await task();
        } catch (e) {
            unlock();
            throw e;
        }

        unlock();
        return result;
    }
};

function unlockFactory(mutex) {
    return () => {
        if (mutex.queue !== null) {
            if (mutex.queue.length) {
                mutex.queue.shift()(unlockFactory(mutex));
            } else {
                mutex.queue = null;
            }
        }
    };
}
