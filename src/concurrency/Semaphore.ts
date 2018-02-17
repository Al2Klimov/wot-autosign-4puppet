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
