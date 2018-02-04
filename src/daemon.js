// For the terms of use see COPYRIGHT.md


const Agent = require("./Agent");
const {load: config} = require("./config");
const Master = require("./Master");
const {config: {print: puppet}} = require("./puppet");
const Services = require("./Services");
const {Promise: {all, ultimaRatio}, tempEvents: tempEvents} = require("./util");


(async () => {
    let [configs, puppetConfig] = await all([config(process.argv.slice(2)), puppet()]);

    if (! configs.length) {
        throw new Error("Nothing to do");
    }

    let services = {};

    for (let config of configs) {
        if (typeof config.listen === "undefined") {
            if (typeof services.agent !== "undefined") {
                throw new Error("More than one agent service defined");
            }

            services.agent = new Agent(config, puppetConfig);
        } else {
            if (typeof services.master !== "undefined") {
                throw new Error("More than one master service defined");
            }

            services.master = new Master(config, puppetConfig);
        }
    }

    services = new Services(services);

    await services.start();

    let clear = tempEvents(process, {
        SIGTERM: shutdown,
        SIGINT: shutdown
    });

    function shutdown() {
        clear();
        services.stop().catch(ultimaRatio);
    }
})().catch(ultimaRatio);
