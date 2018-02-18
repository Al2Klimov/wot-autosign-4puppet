// For the terms of use see COPYRIGHT.md


export class Semaphore {
    private slots: number;
    private slotsUsed: number;
    private queue: (() => void)[];

    public constructor(slots: number) {
        this.slots = slots;
        this.slotsUsed = 0;
        this.queue = [];
    }

    async enqueue<T>(task: () => Promise<T>): Promise<T> {
        if (this.slotsUsed < this.slots) {
            ++this.slotsUsed;
        } else {
            await new Promise<void>((resolve: () => void): void => {
                this.queue.push(resolve);
            });
        }

        try {
            return await task();
        } finally {
            let next = this.queue.shift();

            if (typeof next === "undefined") {
                --this.slotsUsed;
            } else {
                next();
            }
        }
    }
}

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

export class Mutex extends Semaphore {
    public constructor() {
        super(1);
    }
}

export class MultiMutex extends MultiSemaphore {
    public constructor() {
        super(1);
    }
}
