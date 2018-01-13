// For the terms of use see COPYRIGHT.md


if (module !== require.main) {
    throw new Error("RTFM");
}

const Agent = require("./lib/Agent");
const config = require("./lib/config");
const Master = require("./lib/Master");
const puppet = require("./lib/puppet");
const Services = require("./lib/Services");
const util = require("./lib/util");


(async () => {
    let [configs, puppetConfig] = await util.Promise.all([
        config.load(process.argv.slice(2)),
        puppet.config.print()
    ]);

    if (! configs.length) {
        throw new Error("Nothing to do");
    }

    let services = new Services(
        configs.map(config => typeof config.listen === "undefined"
            ? new Agent(config, puppetConfig)
            : new Master(config, puppetConfig))
    );

    await services.start();

    let clear = util.tempEvents(process, {
        SIGTERM: shutdown,
        SIGINT: shutdown
    });

    function shutdown() {
        clear();
        services.stop().catch(util.Promise.ultimaRatio);
    }
})().catch(util.Promise.ultimaRatio);
