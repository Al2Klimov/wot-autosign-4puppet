// For the terms of use see COPYRIGHT.md


module.exports = class {
    constructor(slots) {
        this.slots = slots;
        this.slotsUsed = 0;
        this.queue = [];
    }

    async enqueue(task) {
        if (this.slotsUsed < this.slots) {
            ++this.slotsUsed;
        } else {
            await new Promise(resolve => {
                this.queue.push(resolve);
            });
        }

        try {
            return await task();
        } finally {
            if (this.queue.length) {
                this.queue.shift()();
            } else {
                --this.slotsUsed;
            }
        }
    }
};
