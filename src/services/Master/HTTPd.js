// For the terms of use see COPYRIGHT.md


const {json: bodyParser} = require("body-parser");
const {EventEmitter} = require("events");
const express = require("express");
const {https: {Server: {close: httpsServerClose}}} = require("../../util/promisified");
const {hidePoweredBy, noCache} = require("helmet");
const {createServer} = require("https");
const {Validator} = require("jsonschema");
const {Mutex} = require("../../concurrency/Mutex");
const {net: {Server: {listen}}} = require("../../util/sc");
const {agentNames2Filter} = require("./util");

const {
    fs: {readFile},
    middleware: {fromPromiseFactory, handleErrors},
    promise: {all}
} = require("../../util/misc");


module.exports = class extends EventEmitter {
    constructor(config, puppetConfig, db) {
        super();

        this.config = config;
        this.puppetConfig = puppetConfig;
        this.db = db;
        this.server = null;
        this.stateChangeMutex = new Mutex();

        let missing = ["hostcert", "hostprivkey", "cacert", "cacrl"].filter(key => !puppetConfig.has(key));

        if (missing.length) {
            throw new Error("Missing Puppet config directives: " + JSON.stringify(missing).replace(/[[\]]/, ""));
        }

        for (let wot of config.web_of_trust) {
            wot.trustee = agentNames2Filter(wot.trustee);
            wot.responsible = agentNames2Filter(wot.responsible);
        }
    }

    start() {
        return this.stateChangeMutex.enqueue(async () => {
            if (this.server === null) {
                let [hostcert, hostprivkey, cacert, cacrl] = await all(
                    ["hostcert", "hostprivkey", "cacert", "cacrl"].map(
                        key => readFile(this.puppetConfig.get(key), "utf8")
                    )
                );

                let onError = (err, req, res, next) => {
                    this.emit("error", err);
                };

                this.server = createServer(
                    {
                        cert: [cacert, hostcert],
                        key: hostprivkey,
                        requestCert: true,
                        rejectUnauthorized: true,
                        ca: cacert,
                        crl: cacrl,
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
                        await httpsServerClose.bind(this.server)();
                    }

                    this.server = null;
                    throw e;
                }
            }
        });
    }

    stop() {
        return this.stateChangeMutex.enqueue(async () => {
            if (this.server !== null) {
                await httpsServerClose.bind(this.server)();
                this.server = null;
            }
        });
    }

    express(onError) {
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
                (req, res, next) => {
                    let cn = req.socket.getPeerCertificate(false).subject.CN;
                    let newAgent = req.params.agent;

                    if (this.config.web_of_trust.filter(
                        wot => wot.trustee(cn) && wot.responsible(newAgent)
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
                handleErrors(bodyParser(), (err, req, res) => {
                    res.status(400).end();
                }),
                fromPromiseFactory(async (req, res) => {
                    if (JSON.stringify(req.body) === emptyObjectJson
                        || requestValidator.validate(req.body, schema).errors.length) {
                        res.status(400).end();
                        return;
                    }

                    let db = this.db;

                    await db.doTask(async () => {
                        let newAgent = req.params.agent;

                        await db.runSql(
                            await db.fetchOne("SELECT 1 FROM agent WHERE name = ?;", newAgent) === undefined
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
};
