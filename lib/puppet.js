// For the terms of use see COPYRIGHT.md


const aSync = require("./aSync");
const child_process = require("child_process");


let puppetConfigLine = /^([^ =]+) = (.+)$/;

exports.config = {
    print: async () => {
        let puppetConfigPrinter = child_process.spawn("puppet", ["config", "print"], {
            stdio: ["ignore", "pipe", null]
        });

        let puppetConfig = new Map(), match;

        (await Promise.all([
            aSync.child_process.wait(puppetConfigPrinter),
            aSync.stream.readAll(puppetConfigPrinter.stdout)
        ]))[1].toString().split(/[\r\n]/).forEach(line => {
            match = puppetConfigLine.exec(line);

            if (match !== null) {
                puppetConfig.set(match[1], match[2]);
            }
        });

        return puppetConfig;
    }
};
