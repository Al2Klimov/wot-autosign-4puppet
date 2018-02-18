// For the terms of use see COPYRIGHT.md


class Branch {
    public slotsUsed: number;
    public queue: (() => void)[];

    public constructor() {
        this.slotsUsed = 0;
        this.queue = [];
    }
}

export class MultiSemaphore {
    private slots: number;
    private branches: Map<string, Branch>;

    public constructor(slots: number) {
        this.slots = slots;
        this.branches = new Map<string, Branch>();
    }

    async enqueue<T>(branchName: string, task: () => Promise<T>): Promise<T> {
        let branch = this.branches.get(branchName) as Branch;

        if (branch === undefined) {
            branch = new Branch();

            this.branches.set(branchName, branch);
        }

        if (branch.slotsUsed < this.slots) {
            ++branch.slotsUsed;
        } else {
            await new Promise<void>((resolve: () => void): void => {
                branch.queue.push(resolve);
            });
        }

        try {
            return await task();
        } finally {
            let next = branch.queue.shift();

            if (typeof next === "undefined") {
                if (!--branch.slotsUsed) {
                    this.branches.delete(branchName);
                }
            } else {
                next();
            }
        }
    }
}
