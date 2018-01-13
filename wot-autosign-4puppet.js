// For the terms of use see COPYRIGHT.md


if (module !== require.main) {
    throw new Error("RTFM");
}

const Agent = require("./lib/Agent");
const config = require("./lib/config");
const Master = require("./lib/Master");
const puppet = require("./lib/puppet");
const util = require("./lib/util");


process.on("unhandledRejection", reason => {
    throw reason;
});

(async () => {
    let [configs, puppetConfig] = await util.Promise.all([
        config.load(process.argv.slice(2)),
        puppet.config.print()
    ]);

    if (! configs.length) {
        throw new Error("Nothing to do");
    }

    let services = configs.map(config => typeof config.listen === "undefined"
        ? new Agent(config, puppetConfig)
        : new Master(config, puppetConfig));

    try {
        await util.Promise.all(services.map(service => service.start()));
    } catch (e) {
        await util.Promise.all(services.map(service => service.stop()));
        throw e;
    }

    let clear = util.tempEvents(process, {
        SIGTERM: shutdown,
        SIGINT: shutdown
    });

    function shutdown() {
        clear();

        util.Promise.all(services.map(service => service.stop())).catch(err => {
            throw err;
        });
    }
})().catch(err => {
    throw err;
});
