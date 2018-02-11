// For the terms of use see COPYRIGHT.md


const {json: bodyParser} = require("body-parser");
const {EventEmitter} = require("events");
const express = require("express");
const {https: {Server: {close: httpsServerClose}}} = require("../promisified");
const {hidePoweredBy, noCache} = require("helmet");
const {createServer} = require("https");
const {Validator} = require("jsonschema");
const Mutex = require("../Mutex");
const {net: {Server: {listen}}} = require("../sc");
const Service = require("../Service");
const {agentNames2Filter} = require("./util");
const {fs: {readFile}, middleware: {fromPromiseFactory, handleErrors}, Promise: {all}} = require("../util");


module.exports = class extends Service(EventEmitter) {
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
                    this.express()
                );

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

    express() {
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

                    let status, db = this.db;

                    await db.doTask(async () => {
                        let newAgent = req.params.agent;
                        let row = await db.fetchOne("SELECT status FROM agent WHERE name = ?;", newAgent);

                        if (row === undefined) {
                            await db.runSql(
                                "INSERT INTO agent(name, csr_chksum_algo, csr_chksum, status) VALUES (?, ?, ?, 0);",
                                newAgent,
                                req.body.algo,
                                req.body.checksum
                            );

                            status = 202;

                            this.emit("agent", newAgent);
                        } else {
                            status = row.status ? 201 : 202;
                        }
                    });

                    res.status(status).end();
                })
            );
    }
};
