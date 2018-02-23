// For the terms of use see COPYRIGHT.md


import {spawn} from "child_process";
import {MasterConfig} from "../../config";
import {createHash} from "crypto";
import {Db} from "../Db";
import {DirectoryFeed} from "../DirectoryFeed";
import {FilesLoader} from "../FilesLoader";
import {HTTPd} from "./HTTPd";
import {Logger} from "../../Logger";
import {child_process, crypto, promise} from "../../util/misc";
import {join} from "path";
import {MultiMutex} from "../../util/concurrency";
import {fs} from "../../util/promisified";
import {Service} from "../Service";
import {Services} from "../Services";
import {TaskExecutor} from "../TaskExecutor";
import {Timer} from "../Timer";
import {agentNames2Filter} from "./util";

const {wait} = child_process;
const {pem2der} = crypto;
const {readFile, unlink} = fs;
const {all} = promise;


interface AgentRow {
    csr_chksum_algo: string;
    csr_chksum: string;
}

const csrFile = /^(.+)\.pem$/i;

export class Master implements Service {
    private csrdir: string;
    private taskExecutor: TaskExecutor;
    private timer: Timer;
    private responsible: ((agentName: string) => boolean)[];
    private agentsLocks: MultiMutex;
    private db: Db;
    private services: Services;

    public constructor(config: MasterConfig, puppetConfig: Map<string, string>) {
        let missing = ["hostcert", "hostprivkey", "cacert", "cacrl", "csrdir"].filter(
            (key: string): boolean => !puppetConfig.has(key)
        );

        if (missing.length) {
            throw new Error("Missing Puppet config directives: " + JSON.stringify(missing).replace(/[[\]]/, ""));
        }

        let logger = new Logger(config.logging.level);

        let onError = (error: Error): void => {
            logger.error(error)
        };

        this.csrdir = puppetConfig.get("csrdir") as string;
        this.taskExecutor = (new TaskExecutor()).on("error", onError);
        this.timer = new Timer();
        this.responsible = config.web_of_trust.map(wot => agentNames2Filter(wot.responsible));
        this.agentsLocks = new MultiMutex;

        this.db = new Db(join(config.datadir, "db.sqlite3"), [
            "CREATE TABLE agent ( name TEXT PRIMARY KEY, csr_chksum_algo TEXT, csr_chksum TEXT );"
        ]);

        let filesLoader = new FilesLoader(new Set<string>(["hostcert", "hostprivkey", "cacert", "cacrl"].map(
            (key: string): string => puppetConfig.get(key) as string
        )));

        this.services = new Services(
            {
                db: this.db,
                filesLoader: filesLoader,
                directoryFeed: (new DirectoryFeed(this.csrdir))
                    .on("change", this.onCsrDirChange.bind(this))
                    .on("error", onError),
                httpd: (new HTTPd(config, puppetConfig, this.db, filesLoader))
                    .on("agent", this.onNewAgent.bind(this))
                    .on("error", onError),
                taskExecutor: this.taskExecutor,
                timer: this.timer
            },
            {
                directoryFeed: ["db", "taskExecutor", "timer"],
                httpd: ["db", "filesLoader", "taskExecutor", "timer"],
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

    private onNewAgent(newAgent: string): void {
        this.taskExecutor.run(
            (): Promise<void> => this.agentsLocks.enqueue(newAgent, (): Promise<void> => this.trySign(newAgent))
        );
    }

    private async trySign(agent: string): Promise<void> {
        let [row, [csrFile, csr]] = await (all<any>([
            this.getAgentRow(agent), this.readCsrFile(agent)
        ]) as Promise<[AgentRow | undefined, [string, string | undefined]]>);

        if (row === undefined || csr === undefined) {
            return;
        }

        let der = pem2der(csr);

        if (der === null) {
            this.timer.setTimeout(this.onNewAgent.bind(this), 1000, agent);
            return;
        }

        let csrChksum = createHash((row as AgentRow).csr_chksum_algo).update(der).digest("hex");

        if ((row as AgentRow).csr_chksum === csrChksum) {
            await wait(spawn("puppet", ["cert", "sign", agent]));
        } else {
            await unlink(csrFile);
        }
    }

    private async readCsrFile(agent: string): Promise<[string, string | undefined]> {
        let csrFile = join(this.csrdir, agent + ".pem"), csr: string | undefined = undefined;

        try {
            csr = await readFile(csrFile, "utf8");
        } catch (e) {
            if (typeof e.code === "undefined" || e.code !== "ENOENT") {
                throw e;
            }
        }

        return [csrFile, csr];
    }

    private getAgentRow(agent: string): Promise<AgentRow | undefined> {
        let db = this.db;

        return db.doTask(
            (): Promise<AgentRow | undefined> => db.fetchOne("SELECT csr_chksum_algo, csr_chksum FROM agent WHERE name = ?;", agent)
        );
    }
}
