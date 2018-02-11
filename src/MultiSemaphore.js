// For the terms of use see COPYRIGHT.md


module.exports = class {
    constructor(slots) {
        this.slots = slots;
        this.branches = new Map;
    }

    async enqueue(branchName, task) {
        let branch = this.branches.get(branchName);

        if (branch === undefined) {
            branch = {
                slotsUsed: 0,
                queue: []
            };

            this.branches.set(branchName, branch);
        }

        if (branch.slotsUsed < this.slots) {
            ++branch.slotsUsed;
        } else {
            await new Promise(resolve => {
                branch.queue.push(resolve);
            });
        }

        try {
            return await task();
        } finally {
            if (branch.queue.length) {
                branch.queue.shift()();
            } else if (!--branch.slotsUsed) {
                this.branches.delete(branchName);
            }
        }
    }
};
