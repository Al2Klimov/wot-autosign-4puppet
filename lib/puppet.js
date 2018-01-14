// For the terms of use see COPYRIGHT.md


const {spawn} = require("child_process");
const {child_process: {wait}, Promisify, stream: {readAll}} = require("./util");


let puppetConfigLine = /^([^ =]+) = (.+)$/;

exports.config = {
    print: async () => {
        let puppetConfigPrinter = spawn("puppet", ["config", "print"], {
            stdio: ["ignore", "pipe", null]
        });

        let puppetConfig = new Map(), match;

        (await Promise.all([
            Promisify(wait, puppetConfigPrinter),
            Promisify(readAll, puppetConfigPrinter.stdout)
        ]))[1].toString().split(/[\r\n]/).forEach(line => {
            match = puppetConfigLine.exec(line);

            if (match !== null) {
                puppetConfig.set(match[1], match[2]);
            }
        });

        return puppetConfig;
    }
};
