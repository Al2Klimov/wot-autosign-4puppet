// For the terms of use see COPYRIGHT.md


if (module !== require.main) {
    throw new Error("RTFM");
}

const config = require("./lib/config");
const puppet = require("./lib/puppet");


process.on("unhandledRejection", reason => {
    throw reason;
});

(async () => {
    let [configs, puppetConfig] = await Promise.all([
        config.load(process.argv.slice(2)),
        puppet.config.print()
    ]);

    if (! configs.length) {
        throw new Error("Nothing to do");
    }

    console.log(JSON.stringify(configs));
    console.log(puppetConfig);
})().catch(err => {
    throw err;
});
