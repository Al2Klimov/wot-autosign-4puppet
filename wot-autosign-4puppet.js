// For the terms of use see COPYRIGHT.md


if (module !== require.main) {
    throw new Error("RTFM");
}

const config = require("./lib/config");


process.on("unhandledRejection", reason => {
    throw reason;
});

(async () => {
    let configs = await config.load(process.argv.slice(2));

    if (! configs.length) {
        throw new Error("Nothing to do");
    }

    console.log(JSON.stringify(configs));
})().catch(err => {
    throw err;
});
