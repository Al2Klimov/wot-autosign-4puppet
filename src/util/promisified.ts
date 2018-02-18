// For the terms of use see COPYRIGHT.md


import {mkdtemp, readdir, readFile, rename, rmdir, stat, Stats, unlink} from "fs";
import {Server} from "https";
import {Database} from "sqlite3";


export const fs = {
    mkdtemp: promisify(mkdtemp) as (prefix: string) => Promise<string>,
    readdir: promisify(readdir) as (path: string) => Promise<string[]>,
    readFile: promisify(readFile) as {
        (path: string): Promise<Buffer>;
        (path: string, encoding: string): Promise<string>;
    },
    rename: promisify(rename) as (oldPath: string, newPath: string) => Promise<void>,
    rmdir: promisify(rmdir) as (path: string) => Promise<void>,
    stat: promisify(stat) as (path: string) => Promise<Stats>,
    unlink: promisify(unlink) as (path: string) => Promise<void>
};

export const https = {
    Server: {
        close: promisify(Server.prototype.close) as (this: Server) => Promise<void>
    }
};

export const sqlite3 = {
    Database: {
        close: promisify(Database.prototype.close) as (this: Database) => Promise<void>,
        run: promisify(Database.prototype.run) as (this: Database, sql: string, ...params: any[]) => Promise<void>,
        get: promisify(Database.prototype.get) as <TRow>(this: Database, sql: string, ...params: any[]) => Promise<TRow | undefined>
    }
};

function promisify(f: (this: any, ...args: any[]) => void): (this: any, ...args: any[]) => Promise<any> {
    return function(this: any, ...args: any[]): Promise<any> {
        return new Promise<any>((resolve: (result: any) => void, reject: (error: any) => void): void => {
            f.call(this, ...args, (error: any, result: any): void => {
                if (error) {
                    reject(error);
                } else {
                    resolve(result);
                }
            });
        });
    };
}
