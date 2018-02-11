// For the terms of use see COPYRIGHT.md


const {EventEmitter} = require("events");
const Mutex = require("./Mutex");
const Service = require("./Service");


module.exports = class extends Service(EventEmitter) {
    constructor() {
        super();

        this.stateChangeMutex = new Mutex();
        this.running = false;
        this.runningTasks = 0;
        this.onStopped = null;

        this.errorHandler = reason => {
            this.emit("error", reason);
        };

        this.finally = () => {
            if (!--this.runningTasks && this.onStopped !== null) {
                try {
                    this.onStopped();
                } finally {
                    this.onStopped = null;
                }
            }
        };
    }

    start() {
        return this.stateChangeMutex.enqueue(async () => {
            this.running = true;
        });
    }

    stop() {
        return this.stateChangeMutex.enqueue(() => new Promise(resolve => {
            this.running = false;

            if (this.runningTasks) {
                this.onStopped = resolve;
            } else {
                resolve();
            }
        }));
    }

    run(task) {
        if (this.running) {
            ++this.runningTasks;
            task().catch(this.errorHandler).finally(this.finally);
        }
    }
};
