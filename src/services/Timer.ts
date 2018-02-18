// For the terms of use see COPYRIGHT.md


import {Mutex} from "../concurrency/Mutex";
import {RingLinkedList} from "../util/RingLinkedList";
import {Service} from "./Service";


export class Timer implements Service {
    private pendingTimers: RingLinkedList<NodeJS.Timer> | null;
    private stateChangeMutex: Mutex;

    public constructor() {
        this.pendingTimers = null;
        this.stateChangeMutex = new Mutex();
    }

    public start(): Promise<void> {
        return this.stateChangeMutex.enqueue(async (): Promise<void> => {
            if (this.pendingTimers === null) {
                this.pendingTimers = new RingLinkedList<NodeJS.Timer>();
            }
        });
    }

    public stop(): Promise<void> {
        return this.stateChangeMutex.enqueue(async (): Promise<void> => {
            if (this.pendingTimers !== null) {
                for (let pendingTimer of this.pendingTimers.iter()) {
                    clearTimeout(pendingTimer.value);
                }

                this.pendingTimers = null;
            }
        });
    }

    public setTimeout(f: (...args: any[]) => void, delay: number, ...args: any[]) {
        if (this.pendingTimers !== null) {
            let pendingTimer = this.pendingTimers.append(setTimeout(
                (): void => {
                    pendingTimer.detach();
                    f(...args);
                },
                delay
            ));
        }
    }
}
