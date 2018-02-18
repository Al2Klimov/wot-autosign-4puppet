// For the terms of use see COPYRIGHT.md


import {Mutex} from "../concurrency/Mutex";
import {join} from "path";
import {fs, sqlite3 as promisifiedSqlite3} from "../util/promisified";
import {sqlite3 as scSqlite3} from "../util/sc";
import {Database, OPEN_CREATE, OPEN_READWRITE} from "sqlite3";
import {Service} from "./Service";

const {Database: {new: newDb}} = scSqlite3;
const {mkdtemp, rename, rmdir, stat, unlink} = fs;
const {Database: {close: closeDb, get: fetchOne, run: runSql}} = promisifiedSqlite3;


export class Db implements Service {
    private path: string;
    private schema: string[];
    private lock: Mutex;
    private connection: Database | null;

    public constructor(path: string, schema: string[]) {
        this.path = path;
        this.schema = schema;
        this.lock = new Mutex;
        this.connection = null;
    }

    public start(): Promise<void> {
        return this.lock.enqueue(async (): Promise<void> => {
            if (this.connection === null) {
                try {
                    await stat(this.path);
                } catch (e) {
                    if (typeof e.code !== "undefined" && e.code === "ENOENT") {
                        let tmpDir = await mkdtemp(this.path + "-");

                        try {
                            let tmpDb = join(tmpDir, "db.sqlite3");
                            let conn = await newDb(tmpDb, OPEN_CREATE);

                            try {
                                try {
                                    for (let create of this.schema) {
                                        await runSql.call(conn, create);
                                    }
                                } finally {
                                    await closeDb.call(conn);
                                }

                                await rename(tmpDb, this.path);
                            } catch (e) {
                                await unlink(tmpDb);
                                throw e;
                            }
                        } finally {
                            await rmdir(tmpDir);
                        }
                    } else {
                        throw e;
                    }
                }

                this.connection = await newDb(this.path, OPEN_READWRITE);
            }
        });
    }

    public stop(): Promise<void> {
        return this.lock.enqueue(async (): Promise<void> => {
            if (this.connection !== null) {
                try {
                    await closeDb.call(this.connection);
                } finally {
                    this.connection = null;
                }
            }
        });
    }

    public doTask<T>(task: () => Promise<T>): Promise<T> {
        return this.lock.enqueue(task);
    }

    public fetchOne<T>(sql: string, ...params: any[]): Promise<T | undefined> {
        return fetchOne.call(this.connection, sql, ...params);
    }

    public runSql<T>(sql: string, ...params: any[]): Promise<T> {
        return runSql.call(this.connection, sql, ...params);
    }
}
