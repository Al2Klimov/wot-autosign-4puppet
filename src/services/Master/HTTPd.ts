// For the terms of use see COPYRIGHT.md


import {json as bodyParser} from "body-parser";
import {MasterConfig} from "../../config";
import {Db} from "../Db";
import {EventEmitter} from "events";
import * as express from "express";
import {Application, Request, Response} from "express";
import {FilesLoader} from "../FilesLoader";
import {https} from "../../util/promisified";
import {hidePoweredBy, noCache} from "helmet";
import {createServer, Server} from "https";
import {Validator} from "jsonschema";
import {fs, middleware, promise} from "../../util/misc";
import {Mutex} from "../../util/concurrency";
import {net} from "../../util/sc";
import {Service} from "../Service";
import {TLSSocket} from "tls";
import {agentNames2Filter} from "./util";

const {readFile} = fs;
const {Server: {close: httpsServerClose}} = https;
const {fromPromiseFactory, handleErrors} = middleware;
const {Server: {listen}} = net;
const {all} = promise;


interface Trust {
    trustee: (agentName: string) => boolean;
    responsible: (agentName: string) => boolean;
}

export class HTTPd extends EventEmitter implements Service {
    private config: MasterConfig;
    private puppetConfig: Map<string, string>;
    private db: Db;
    private filesLoader: FilesLoader;
    private server: Server | null;
    private stateChangeMutex: Mutex;
    private webOfTrust: Trust[];

    public constructor(config: MasterConfig, puppetConfig: Map<string, string>, db: Db, filesLoader: FilesLoader) {
        super();

        this.config = config;
        this.puppetConfig = puppetConfig;
        this.db = db;
        this.filesLoader = filesLoader;
        this.server = null;
        this.stateChangeMutex = new Mutex();
        this.webOfTrust = [];

        for (let wot of config.web_of_trust) {
            this.webOfTrust.push({
                trustee: agentNames2Filter(wot.trustee),
                responsible: agentNames2Filter(wot.responsible)
            });
        }
    }

    public start(): Promise<void> {
        return this.stateChangeMutex.enqueue(async (): Promise<void> => {
            if (this.server === null) {
                let onError = (err: Error, req: Request, res: Response, next: (...args: any[]) => void): void => {
                    this.emit("error", err);
                };

                this.server = createServer(
                    {
                        cert: [
                            (this.filesLoader.contents.get(this.puppetConfig.get("cacert") as string) as Buffer).toString(),
                            (this.filesLoader.contents.get(this.puppetConfig.get("hostcert") as string) as Buffer).toString()
                        ],
                        key: (this.filesLoader.contents.get(this.puppetConfig.get("hostprivkey") as string) as Buffer).toString(),
                        requestCert: true,
                        rejectUnauthorized: true,
                        ca: (this.filesLoader.contents.get(this.puppetConfig.get("cacert") as string) as Buffer).toString(),
                        crl: (this.filesLoader.contents.get(this.puppetConfig.get("cacrl") as string) as Buffer).toString(),
                        secureProtocol: "TLSv1_2_method"
                    },
                    this.express(onError)
                )
                    .on("error", onError)
                    .on("tlsClientError", onError);

                try {
                    let listenEP = listen.bind(this.server);
                    await all(this.config.listen.map(ep => listenEP(ep.port, ep.address)));
                } catch (e) {
                    if (this.server.listening) {
                        await httpsServerClose.call(this.server);
                    }

                    this.server = null;
                    throw e;
                }
            }
        });
    }

    public stop(): Promise<void> {
        return this.stateChangeMutex.enqueue(async (): Promise<void> => {
            if (this.server !== null) {
                await httpsServerClose.call(this.server);
                this.server = null;
            }
        });
    }

    private express(onError: (err: Error, req: Request, res: Response, next: (...args: any[]) => void) => void): Application {
        let emptyObjectJson = JSON.stringify({});
        let requestValidator = new Validator();

        let schema = {
            type: "object",
            required: [
                "algo",
                "checksum"
            ],
            properties: {
                algo: {
                    type: "string",
                    "const": "sha512"
                },
                checksum: {
                    type: "string",
                    pattern: "^[a-f0-9]{128}$"
                }
            }
        };

        let idnHostname = {
            type: "string",
            format: "idn-hostname"
        };

        return express()
            .use(hidePoweredBy())
            .put(
                "/agent/:agent",
                noCache(),
                (req: Request, res: Response, next: (...args: any[]) => void): void => {
                    let cn = (req.socket as TLSSocket).getPeerCertificate(false).subject.CN;
                    let newAgent = req.params.agent as string;

                    if (this.webOfTrust.filter(
                        (wot: Trust): boolean => wot.trustee(cn) && wot.responsible(newAgent)
                    ).length) {
                        if (requestValidator.validate(newAgent, idnHostname).errors.length) {
                            res.status(400).end();
                        } else {
                            next();
                        }
                    } else {
                        res.status(403).end();
                    }
                },
                handleErrors(bodyParser(), (err: Error, req: Request, res: Response): void => {
                    res.status(400).end();
                }),
                fromPromiseFactory(async (req: Request, res: Response) => {
                    if (JSON.stringify(req.body) === emptyObjectJson
                        || requestValidator.validate(req.body, schema).errors.length) {
                        res.status(400).end();
                        return;
                    }

                    let db = this.db;

                    await db.doTask(async (): Promise<void> => {
                        let newAgent = req.params.agent;

                        await db.runSql(
                            await db.fetchOne<Object>("SELECT 1 FROM agent WHERE name = ?;", newAgent) === undefined
                                ? "INSERT INTO agent(csr_chksum_algo, csr_chksum, name) VALUES (?, ?, ?);"
                                : "UPDATE agent SET csr_chksum_algo = ?, csr_chksum = ? WHERE name = ?",
                            req.body.algo,
                            req.body.checksum,
                            newAgent
                        );

                        this.emit("agent", newAgent);
                    });

                    res.status(202).end();
                })
            )
            .use(onError);
    }
}
