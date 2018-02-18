// For the terms of use see COPYRIGHT.md


import {EventEmitter} from "events";
import {FSWatcher, watch} from "fs";
import {Mutex} from "../util/concurrency";
import {fs} from "../util/promisified";
import {Service} from "./Service";

const {readdir} = fs;


export class DirectoryFeed extends EventEmitter implements Service {
    private dir: string;
    private stateChangeMutex: Mutex;
    private watcher: FSWatcher | null;
    private listing: Promise<void> | null;

    public constructor(dir: string) {
        super();

        this.dir = dir;
        this.stateChangeMutex = new Mutex();
        this.watcher = null;
        this.listing = null;
    }

    public start(): Promise<void> {
        return this.stateChangeMutex.enqueue(async (): Promise<void> => {
            if (this.watcher === null) {
                this.watcher = watch(this.dir, (eventType: string, filename: string): void => {
                    this.emit("change", filename);
                }).on("error", (reason: Error): void => {
                    this.emit("error", reason);
                });

                this.listing = (async (): Promise<void> => {
                    try {
                        for (let filename of await readdir(this.dir)) {
                            this.emit("change", filename);
                        }
                    } catch (e) {
                        this.emit("error", e);
                    }
                })();
            }
        });
    }

    public stop(): Promise<void> {
        return this.stateChangeMutex.enqueue(async () => {
            if (this.watcher !== null) {
                await this.listing;
                this.listing = null;

                try {
                    this.watcher.close();
                } finally {
                    this.watcher = null;
                }
            }
        });
    }
}
