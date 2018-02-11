// For the terms of use see COPYRIGHT.md


const Mutex = require("../concurrency/Mutex");
const {join} = require("path");
const {sqlite3: {Database: {new: newDb}}} = require("../util/sc");
const Service = require("./Service");
const {OPEN_READWRITE} = require("sqlite3");

const {
    fs: {mkdtemp, rename, rmdir, stat, unlink},
    sqlite3: {Database: {close: closeDb, get: fetchOne, run: runSql}}
} = require("../util/promisified");


module.exports = class extends Service() {
    constructor(path, schema) {
        super();

        this.path = path;
        this.schema = schema;
        this.lock = new Mutex;
        this.connection = null;
    }

    start() {
        return this.lock.enqueue(async () => {
            if (this.connection === null) {
                try {
                    await stat(this.path);
                } catch (e) {
                    if (typeof e.code !== "undefined" && e.code === "ENOENT") {
                        let tmpDir = await mkdtemp(this.path + "-");

                        try {
                            let tmpDb = join(tmpDir, "db.sqlite3");
                            let conn = await newDb(tmpDb);

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

    stop() {
        return this.lock.enqueue(async () => {
            if (this.connection !== null) {
                try {
                    await closeDb.call(this.connection);
                } finally {
                    this.connection = null;
                }
            }
        });
    }

    doTask(task) {
        return this.lock.enqueue(task);
    }

    fetchOne(sql, ...params) {
        return fetchOne.call(this.connection, sql, ...params);
    }

    runSql(sql, ...params) {
        return runSql.call(this.connection, sql, ...params);
    }
};
