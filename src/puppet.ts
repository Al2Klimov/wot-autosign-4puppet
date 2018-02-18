// For the terms of use see COPYRIGHT.md


import {spawn} from "child_process";
import {child_process, promise, stream} from "./util/misc";

const {all} = promise;


export const config = {
    print: ((): () => Promise<Map<string, string>> => {
        const wait = child_process.wait, readAll = stream.readAll;
        const puppetConfigLine = /^([^ =]+) = (.+)$/, crOrLf = /[\r\n]/;

        return async (): Promise<Map<string, string>> => {
            let puppetConfigPrinter = spawn("puppet", ["config", "print"], {
                stdio: ["ignore", "pipe", null]
            });

            let puppetRawConfig = (await (all<any>([
                wait(puppetConfigPrinter), readAll(puppetConfigPrinter.stdout)
            ]) as Promise<[void, Buffer | null]>))[1];

            let puppetConfig = new Map<string, string>();

            if (puppetRawConfig !== null) {
                let match: RegExpExecArray | null;
                for (let line of puppetRawConfig.toString().split(crOrLf)) {
                    match = puppetConfigLine.exec(line);

                    if (match !== null) {
                        puppetConfig.set(match[1], match[2]);
                    }
                }
            }

            return puppetConfig;
        };
    })()
};
