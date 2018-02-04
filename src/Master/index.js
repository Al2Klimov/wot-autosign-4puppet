// For the terms of use see COPYRIGHT.md


const Db = require("../Db");
const HTTPd = require("./HTTPd");
const {join} = require("path");
const Services = require("../Services");


module.exports = class extends Services {
    constructor(config, puppetConfig) {
        let db = new Db(join(config.datadir, "db.sqlite3"), [
            "CREATE TABLE agent ( name TEXT PRIMARY KEY, csr_chksum_algo TEXT, csr_chksum TEXT, status INT );"
        ]);

        super(
            {
                db: db,
                httpd: new HTTPd(config, puppetConfig, db)
            },
            {httpd: ["db"]}
        );
    }
};
