// For the terms of use see COPYRIGHT.md


if (module !== require.main) {
    throw new Error("RTFM");
}

require("./lib/hack")();


const Agent = require("./lib/Agent");
const {load: config} = require("./lib/config");
const Master = require("./lib/Master");
const {config: {print: puppet}} = require("./lib/puppet");
const Services = require("./lib/Services");
const {Promise: {ultimaRatio}, tempEvents: tempEvents} = require("./lib/util");


(async () => {
    let [configs, puppetConfig] = await Promise.all([config(process.argv.slice(2)), puppet()]);

    if (! configs.length) {
        throw new Error("Nothing to do");
    }

    let services = new Services(
        configs.map(config => typeof config.listen === "undefined"
            ? new Agent(config, puppetConfig)
            : new Master(config, puppetConfig))
    );

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
