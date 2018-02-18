// For the terms of use see COPYRIGHT.md


import {ChildProcess} from "child_process";
import {EventEmitter} from "events";
import {fs as promisifiedFs} from "./promisified";
import {Semaphore} from "../concurrency/Semaphore";
import {Readable} from "stream";


export const child_process = {
    wait: (child: ChildProcess): Promise<void> => new Promise<void>(
        (resolve: () => void, reject: (err: Error) => void): void => {
            let clear = tempEvents(child, {
                exit: (code: number, signal: string | null): void => {
                    clear();

                    if (signal === null) {
                        if (code === 0) {
                            resolve();
                        } else {
                            reject(new Error("Child process " + child.pid + " exited with " + code + "(expected: 0)"));
                        }
                    } else {
                        reject(new Error("Child process " + child.pid + " was terminated by " + signal));
                    }
                },
                error: (err: Error): void => {
                    clear();
                    reject(err);
                }
            });
        }
    )
};

export const crypto = {
    pem2der: ((): (pem: string) => Buffer | null => {
        const crLf = /[\r\n]/, csrStart = /-+BEGIN [^-]+-+/, csrEnd = /-+END [^-]+-+/;

        return (pem: string): Buffer | null => {
            let lines = pem.split(crLf), start = -1, end = -1, i = 0;

            for (let line of lines) {
                if (start === -1) {
                    if (csrStart.exec(line) !== null) {
                        start = i + 1;
                    }
                } else if (csrEnd.exec(line) !== null) {
                    end = i;
                    break;
                }

                ++i;
            }

            return end === -1 ? null : new Buffer(
                lines.slice(start, end).map((s: string): string => s.trim()).join(""),
                "base64"
            );
        };
    })()
};

export const fs = {
    readFile: ((): (...args: any[]) => Promise<any> => {
        let fsReadFileLimiter = new Semaphore(64);
        let readFile = promisifiedFs.readFile as (...args: any[]) => Promise<any>;

        return (...args: any[]): Promise<any> => fsReadFileLimiter.enqueue((): Promise<any> => readFile(...args));
    })() as {
        (path: string): Promise<Buffer>;
        (path: string, encoding: string): Promise<string>;
    }
};

export const middleware = {
    fromPromiseFactory: (
        f: (req: any, res: any, next: (...args: any[]) => void) => Promise<void>
    ): (req: any, res: any, next: (...args: any[]) => void) => void =>
        (req: any, res: any, next: (...args: any[]) => void): void => {
            f(req, res, next).catch((reason: Error) => next(reason));
        },

    handleErrors: (
        middleware: (req: any, res: any, next: (...args: any[]) => void) => void,
        errorHandler: (err: Error, req: any, res: any, next: (...args: any[]) => void) => void
    ): (req: any, res: any, next: (...args: any[]) => void) => void =>
        (req: any, res: any, next: (...args: any[]) => void): void => {
            middleware(req, res, (...args: any[]): void => {
                let err = args[0];

                if (err instanceof Error) {
                    errorHandler(err, req, res, next);
                } else {
                    next(...args);
                }
            });
        }
};

export const promise = {
    all: <T>(promises: Promise<T>[]): Promise<T[]> => promises.length
        ? new Promise<T[]>((resolve: (result: T[]) => void, reject: (reason: Error) => void): void => {
            let error: Error | null = null;
            let remain = promises.length;
            let results: {length: number, [index: number]: T} = {length: remain};

            promises.forEach((promise: Promise<T>, i: number): void => {
                promise.then(
                    (result: T): void => {
                        results[i] = result;
                        done1();
                    },
                    (reason: Error): void => {
                        if (error === null) {
                            error = reason;
                        }

                        done1();
                    }
                );
            });

            function done1(): void {
                if (--remain === 0) {
                    if (error === null) {
                        resolve(Array.from<T>(results));
                    } else {
                        reject(error);
                    }
                }
            }
        })
        : Promise.resolve<T[]>([])
};

export const stream = {
    readAll: (stream: Readable): Promise<Buffer | null> => new Promise<Buffer | null>(
        (resolve: (result: Buffer | null) => void, reject: (reason: Error) => void): void => {
            let result: Buffer[] = [];

            let clear = tempEvents(stream, {
                data: (chunk: Buffer): void => {
                    result.push(chunk);
                },
                end: onEnd,
                error: (err: Error): void => {
                    clear();
                    reject(err);
                },
                close: onEnd,
            });

            function onEnd(): void {
                clear();
                resolve(result.length ? Buffer.concat(result) : null);
            }
        }
    )
};

export function tempEvents(emitter: EventEmitter, events: { [name: string]: (...args: any[]) => void }): () => void {
    for (let event in events) {
        emitter.on(event, events[event]);
    }

    return (): void => {
        for (let event in events) {
            emitter.removeListener(event, events[event]);
        }
    };
}
