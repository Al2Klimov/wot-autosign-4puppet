// For the terms of use see COPYRIGHT.md


import {Mutex} from "../util/concurrency";
import {fs, promise} from "../util/misc";
import {Service} from "./Service";

const {readFile} = fs;
const {all} = promise;


export class FilesLoader implements Service {
    private paths: Set<string>;
    private _contents: Map<string, Buffer>;
    private stateChangeMutex: Mutex;

    public constructor(paths: Set<string>) {
        this.paths = paths;
        this._contents = new Map<string, Buffer>();
        this.stateChangeMutex = new Mutex();
    }

    public start(): Promise<void> {
        return this.stateChangeMutex.enqueue(async (): Promise<void> => {
            let readings: Promise<void>[] = [];

            for (let path of this.paths) {
                readings.push(this.loadFile(path));
            }

            await all(readings);
        });
    }

    public stop(): Promise<void> {
        return this.stateChangeMutex.enqueue(async (): Promise<void> => {
            this._contents.clear();
        });
    }

    private async loadFile(path: string): Promise<void> {
        this._contents.set(path, await readFile(path));
    }

    get contents(): Map<string, Buffer> {
        return this._contents;
    }
}
