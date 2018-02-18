// For the terms of use see COPYRIGHT.md


import {Database} from "sqlite3";
import {tempEvents} from "./misc";
import {Server} from "net";


export const net = {
    Server: {
        listen: function(this: Server, port: number, hostname: string): Promise<void> {
            return new Promise<void>((resolve: () => void, reject: (reason: Error) => void): void => {
                let clear = tempEvents(this, {
                    listening: (): void => {
                        clear();
                        resolve();
                    },
                    error: (err: Error): void => {
                        clear();
                        reject(err);
                    }
                });

                this.listen(port, hostname);
            });
        }
    }
};

export const sqlite3 = {
    Database: {
        new: (filename: string, mode: number): Promise<Database> => new Promise<Database>(
            (resolve: (result: Database) => void, reject: (reason: Error) => void): void => {
                let db = new Database(filename, mode, (err: Error | null): void => {
                    if (err === null) {
                        resolve(db);
                    } else {
                        reject(err);
                    }
                });
            }
        )
    }
};
