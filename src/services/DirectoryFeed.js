// For the terms of use see COPYRIGHT.md


const {EventEmitter} = require("events");
const {watch} = require("fs");
const {Mutex} = require("../concurrency/Mutex");
const {fs: {readdir}} = require("../util/promisified");


module.exports = class extends EventEmitter {
    constructor(dir) {
        super();

        this.dir = dir;
        this.stateChangeMutex = new Mutex();
        this.watcher = null;
        this.listing = null;
    }

    start() {
        return this.stateChangeMutex.enqueue(async () => {
            if (this.watcher === null) {
                this.watcher = watch(this.dir, (eventType, filename) => {
                    this.emit("change", filename);
                }).on("error", reason => {
                    this.emit("error", reason);
                });

                this.listing = (async () => {
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

    stop() {
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
};
