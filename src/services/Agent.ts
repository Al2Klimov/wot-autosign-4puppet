// For the terms of use see COPYRIGHT.md


import {MultiMutex} from "../util/concurrency";
import {AgentConfig} from "../config";
import {createHash} from "crypto";
import {Db} from "./Db";
import {DirectoryFeed} from "./DirectoryFeed";
import {FilesLoader} from "./FilesLoader";
import {Logger} from "../Logger";
import {crypto, promise} from "../util/misc";
import {join} from "path";
import {fs} from "../util/promisified";
import {Response} from "request";
import * as request from "request-promise-native";
import {Service} from "./Service";
import {Services} from "./Services";
import {TaskExecutor} from "./TaskExecutor";
import {Timer} from "./Timer";

const {pem2der} = crypto;
const {readFile} = fs;
const {all} = promise;


interface AgentRow {
    csr_chksum_algo: string;
    csr_chksum: string;
}

const csrFile = /^(.+)\.pem$/i;

export class Agent implements Service {
    private csrdir: string;
    private puppetConfig: Map<string, string>;
    private taskExecutor: TaskExecutor;
    private timer: Timer;
    private agentsLocks: MultiMutex;
    private db: Db;
    private filesLoader: FilesLoader;
    private services: Services;
    private masterBaseUrl: string;

    public constructor(config: AgentConfig, puppetConfig: Map<string, string>) {
        let missing = ["hostcert", "hostprivkey", "cacert"].filter((key: string): boolean => !puppetConfig.has(key));

        if (missing.length) {
            throw new Error("Missing Puppet config directives: " + JSON.stringify(missing).replace(/[[\]]/, ""));
        }

        let logger = new Logger(config.logging.level);
        let onError = logger.error.bind(logger);

        this.csrdir = config.csrdir;
        this.puppetConfig = puppetConfig;
        this.masterBaseUrl = "https://" + config.master.host + ":" + config.master.port;
        this.taskExecutor = (new TaskExecutor()).on("error", onError);
        this.timer = new Timer();
        this.agentsLocks = new MultiMutex;
        this.filesLoader = new FilesLoader(new Set<string>(["hostcert", "hostprivkey", "cacert"].map(puppetConfig.get.bind(puppetConfig))));

        this.db = new Db(join(config.datadir, "db.sqlite3"), [
            "CREATE TABLE agent ( name TEXT PRIMARY KEY, csr_chksum_algo TEXT, csr_chksum TEXT );"
        ]);

        this.services = new Services(
            {
                db: this.db,
                directoryFeed: (new DirectoryFeed(this.csrdir))
                    .on("change", this.onCsrDirChange.bind(this))
                    .on("error", onError),
                filesLoader: this.filesLoader,
                taskExecutor: this.taskExecutor,
                timer: this.timer
            },
            {
                directoryFeed: ["db", "filesLoader", "taskExecutor", "timer"],
                taskExecutor: ["db"],
                timer: ["db"]
            }
        );
    }

    public start(): Promise<void> {
        return this.services.start();
    }

    public stop(): Promise<void> {
        return this.services.stop();
    }

    private onCsrDirChange(filename: string): void {
        let m = csrFile.exec(filename);

        if (m === null) {
            return;
        }

        this.onNewAgent(m[1]);
    }

    private onNewAgent(newAgent: string): void {
        this.taskExecutor.run(
            (): Promise<void> => this.agentsLocks.enqueue(newAgent, (): Promise<void> => this.tryAuthz(newAgent))
        );
    }

    private async tryAuthz(agent: string): Promise<void> {
        let [row, csr] = await (all<any>(
            [this.getAgentRow(agent), this.readCsrFile(agent)]
        ) as Promise<[AgentRow | undefined, string | undefined]>);

        if (typeof csr === "undefined") {
            return;
        }

        let der = pem2der(csr);

        if (der === null) {
            this.timer.setTimeout(this.onNewAgent.bind(this), 1000, agent);
            return;
        }

        if (typeof row !== "undefined") {
            let csrChksum = createHash(row.csr_chksum_algo).update(der).digest("hex");

            if (row.csr_chksum === csrChksum) {
                return;
            }
        }

        let csrChksum = createHash("sha512").update(der).digest("hex");
        let res: Response;

        try {
            res = await request.put({
                url: this.masterBaseUrl + "/agent/" + agent,
                strictSSL: true,
                cert: this.filesLoader.contents.get(this.puppetConfig.get("hostcert") as string),
                key: this.filesLoader.contents.get(this.puppetConfig.get("hostprivkey") as string),
                ca: this.filesLoader.contents.get(this.puppetConfig.get("cacert") as string),
                agentOptions: {
                    secureProtocol: "TLSv1_2_method"
                },
                body: {
                    algo: "sha512",
                    checksum: csrChksum
                },
                json: true,
                resolveWithFullResponse: true
            });
        } catch (e) {
            this.timer.setTimeout(this.onNewAgent.bind(this), 60000, agent);
            return;
        }

        if (res.statusCode !== 202) {
            this.timer.setTimeout(this.onNewAgent.bind(this), 300000, agent);
            return;
        }

        let db = this.db;

        await db.doTask((): Promise<void> => db.runSql(
            "INSERT INTO agent(name, csr_chksum_algo, csr_chksum) VALUES (?, 'sha512', ?);",
            agent,
            csrChksum
        ));
    }

    private async readCsrFile(agent: string): Promise<string | undefined> {
        let csrFile = join(this.csrdir, agent + ".pem"), csr = undefined;

        try {
            csr = await readFile(csrFile, "utf8");
        } catch (e) {
            if (typeof e.code === "undefined" || e.code !== "ENOENT") {
                throw e;
            }
        }

        return csr;
    }

    private getAgentRow(agent: string): Promise<AgentRow | undefined> {
        let db = this.db;

        return db.doTask((): Promise<AgentRow | undefined> => db.fetchOne<AgentRow>(
            "SELECT csr_chksum_algo, csr_chksum FROM agent WHERE name = ?;",
            agent
        ));
    }
}
