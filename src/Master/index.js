// For the terms of use see COPYRIGHT.md


const {spawn} = require("child_process");
const {createHash} = require("crypto");
const Db = require("../Db");
const DirectoryFeed = require("../DirectoryFeed");
const HTTPd = require("./HTTPd");
const {join} = require("path");
const MultiMutex = require("../MultiMutex");
const {fs: {readFile, unlink}} = require("../promisified");
const Service = require("../Service");
const Services = require("../Services");
const TaskExecutor = require("../TaskExecutor");
const Timer = require("../Timer");
const {agentNames2Filter} = require("./util");
const {child_process: {wait}, Promise: {all}} = require("../util");


const csrFile = /^(.+)\.pem$/i, crLf = /[\r\n]/;
const csrStart = /-+BEGIN CERTIFICATE REQUEST-+/, csrEnd = /-+END CERTIFICATE REQUEST-+/;

module.exports = class extends Service() {
    constructor(config, puppetConfig) {
        let missing = ["csrdir"].filter(key => !puppetConfig.has(key));

        if (missing.length) {
            throw new Error("Missing Puppet config directives: " + JSON.stringify(missing).replace(/[[\]]/, ""));
        }

        super();

        this.csrdir = puppetConfig.get("csrdir");
        this.taskExecutor = new TaskExecutor();
        this.timer = new Timer();
        this.responsible = config.web_of_trust.map(wot => agentNames2Filter(wot.responsible));
        this.agentsLocks = new MultiMutex;

        this.db = new Db(join(config.datadir, "db.sqlite3"), [
            "CREATE TABLE agent ( name TEXT PRIMARY KEY, csr_chksum_algo TEXT, csr_chksum TEXT, status INT );"
        ]);

        this.services = new Services(
            {
                db: this.db,
                directoryFeed: (new DirectoryFeed(this.csrdir)).on("change", this.onCsrDirChange.bind(this)),
                httpd: (new HTTPd(config, puppetConfig, this.db)).on("agent", this.onNewAgent.bind(this)),
                taskExecutor: this.taskExecutor,
                timer: this.timer
            },
            {
                directoryFeed: ["db", "taskExecutor", "timer"],
                httpd: ["db", "taskExecutor", "timer"],
                taskExecutor: ["db"],
                timer: ["db"]
            }
        );
    }

    start() {
        return this.services.start();
    }

    stop() {
        return this.services.stop();
    }

    onCsrDirChange(filename) {
        let m = csrFile.exec(filename);

        if (m === null) {
            return;
        }

        let cn = m[1], responsible = false;

        for (let filter of this.responsible) {
            if (filter(cn)) {
                responsible = true;
                break;
            }
        }

        if (!responsible) {
            return;
        }

        this.onNewAgent(cn);
    }

    onNewAgent(newAgent) {
        this.taskExecutor.run(() => this.agentsLocks.enqueue(newAgent, () => this.trySign(newAgent)));
    }

    async trySign(agent) {
        let [row, [csrFile, csr]] = await all([this.getAgentRow(agent), this.readCsrFile(agent)]);

        if (row === undefined || csr === undefined) {
            return;
        }

        let lines = csr.split(crLf), start = -1, end = -1, i = 0;

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

        if (end === -1) {
            this.timer.setTimeout(this.onNewAgent.bind(this), 1000, agent);
            return;
        }

        let csrChksum = createHash(row.csr_chksum_algo)
            .update(new Buffer(lines.slice(start, end).map(s => s.trim()).join(""), "base64"))
            .digest("hex");

        if (row.csr_chksum === csrChksum) {
            await wait(spawn("puppet", ["cert", "sign", agent]));
        } else {
            await unlink(csrFile);
        }
    }

    async readCsrFile(agent) {
        let csrFile = join(this.csrdir, agent + ".pem"), csr = undefined;

        try {
            csr = await readFile(csrFile);
        } catch (e) {
            if (typeof e.code === "undefined" || e.code !== "ENOENT") {
                throw e;
            }
        }

        return [csrFile, csr];
    }

    getAgentRow(agent) {
        let db = this.db;

        return db.doTask(() => db.fetchOne(
            "SELECT csr_chksum_algo, csr_chksum, status FROM agent WHERE name = ?;",
            agent
        ));
    }
};
