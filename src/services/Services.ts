// For the terms of use see COPYRIGHT.md


import {promise} from "../util/misc";
import {Mutex} from "../util/concurrency";
import {Service} from "./Service";

const {all} = promise;


interface ServicesCollection {
    [name: string]: Service;
}

interface ServiceDependencies {
    [name: string]: string[];
}

interface TasksByName {
    [name: string]: Promise<void>;
}

export class Services implements Service {
    private services: ServicesCollection;
    private dependencies: ServiceDependencies;
    private reverseDependencies: ServiceDependencies;
    private stateChangeMutex: Mutex;

    public constructor(services: ServicesCollection, dependencies: ServiceDependencies = {}) {
        this.services = services;
        this.dependencies = dependencies;
        this.reverseDependencies = {};
        this.stateChangeMutex = new Mutex();

        for (let service in this.services) {
            if (typeof this.dependencies[service] === "undefined") {
                this.dependencies[service] = [];
            }

            this.reverseDependencies[service] = [];
        }

        for (let service in this.services) {
            for (let dependency of this.dependencies[service]) {
                this.reverseDependencies[dependency].push(service);
            }
        }
    }

    public start(): Promise<void> {
        return this.stateChangeMutex.enqueue(async (): Promise<void> => {
            let tasks: TasksByName = {};
            let allTasks: Promise<void>[] = [];

            let nextEventLoopRound = new Promise<void>((resolve: () => void): void => {
                setTimeout(resolve, 0);
            });

            let start = async (service: string): Promise<void> => {
                await nextEventLoopRound;

                for (let dependency of this.dependencies[service]) {
                    await tasks[dependency];
                }

                await this.services[service].start();
            };

            for (let service in this.services) {
                allTasks.push(tasks[service] = start(service));
            }

            try {
                await all(allTasks);
            } catch (e) {
                await this.stopUnsafe();
                throw e;
            }
        });
    }

    public stop(): Promise<void> {
        return this.stateChangeMutex.enqueue(this.stopUnsafe.bind(this));
    }

    private async stopUnsafe(): Promise<void> {
        let tasks: TasksByName = {};
        let allTasks: Promise<void>[] = [];

        let nextEventLoopRound = new Promise<void>((resolve: () => void): void => {
            setTimeout(resolve, 0);
        });

        let stop = async (service: string): Promise<void> => {
            await nextEventLoopRound;

            for (let dependency of this.reverseDependencies[service]) {
                try {
                    await tasks[dependency];
                } catch (e) {
                }
            }

            await this.services[service].stop();
        };

        for (let service in this.services) {
            allTasks.push(tasks[service] = stop(service));
        }

        await all(allTasks);
    }
}
