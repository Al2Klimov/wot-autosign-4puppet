// For the terms of use see COPYRIGHT.md


import {EventEmitter} from "events";
import {Mutex} from "../util/concurrency";
import {Service} from "./Service";


export class TaskExecutor extends EventEmitter implements Service {
    private stateChangeMutex: Mutex;
    private running: boolean;
    private runningTasks: number;
    private onStopped: (() => void) | null;
    private runner: (task: () => Promise<void>) => Promise<void>;

    public constructor() {
        super();

        this.stateChangeMutex = new Mutex();
        this.running = false;
        this.runningTasks = 0;
        this.onStopped = null;

        this.runner = async (task: () => Promise<void>): Promise<void> => {
            try {
                await task();
            } catch (e) {
                this.emit("error", e);
            } finally {
                if (!--this.runningTasks && this.onStopped !== null) {
                    try {
                        this.onStopped();
                    } finally {
                        this.onStopped = null;
                    }
                }
            }
        };
    }

    public start(): Promise<void> {
        return this.stateChangeMutex.enqueue(async (): Promise<void> => {
            this.running = true;
        });
    }

    public stop(): Promise<void> {
        return this.stateChangeMutex.enqueue((): Promise<void> => new Promise<void>((resolve: () => void) => {
            this.running = false;

            if (this.runningTasks) {
                this.onStopped = resolve;
            } else {
                resolve();
            }
        }));
    }

    public run(task: () => Promise<void>): void {
        if (this.running) {
            ++this.runningTasks;
            this.runner(task);
        }
    }
}
