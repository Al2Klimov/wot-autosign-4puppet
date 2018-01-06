// For the terms of use see COPYRIGHT.md


const aSync = require("./aSync");
const express = require("express");
const https = require("https");
const Service = require("./Service");


module.exports = class extends Service {
    constructor(config, puppetConfig) {
        super();

        this.config = config;
        this.puppetConfig = puppetConfig;
        this.server = null;

        let missing = ["hostcert", "hostprivkey", "cacert", "cacrl"].filter(key => !puppetConfig.has(key));

        if (missing.length) {
            throw new Error("Missing Puppet config directives: " + JSON.stringify(missing).replace(/[[\]]/, ""));
        }

        for (let wot of config.web_of_trust) {
            wot.trustee = agentNames2Filter(wot.trustee);
            wot.responsible = agentNames2Filter(wot.responsible);
        }
    }

    async start() {
        if (this.server === null) {
            let [hostcert, hostprivkey, cacert, cacrl] = await Promise.all(
                ["hostcert", "hostprivkey", "cacert", "cacrl"].map(
                    key => aSync.fs.readFile(this.puppetConfig.get(key), "utf8")
                )
            );

            this.server = https.createServer(
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
                await Promise.all(this.config.listen.map(
                    listen => aSync.net.Server.listen(this.server, listen.port, listen.address)
                ));
            } catch (e) {
                await this.stop();
                throw e;
            }
        }
    }

    async stop() {
        if (this.server !== null) {
            let closing = aSync.net.Server.close(this.server);
            this.server = null;
            await closing;
        }
    }

    express() {
        // TODO
        return express();
    }
};

function agentNames2Filter(agentNames) {
    if (agentNames instanceof Array) {
        agentNames = new Set(agentNames);
        return agentName => agentNames.has(agentName);
    }

    agentNames = new RegExp(agentNames);
    return agentName => agentNames.exec(agentName) !== null;
}
