// For the terms of use see COPYRIGHT.md


import {Agent} from "./services/Agent";
import {load as config, MasterConfig} from "./config";
import {Logger} from "./Logger";
import {Master} from "./services/Master";
import {promise, tempEvents} from "./util/misc";
import {config as puppetConfig} from "./puppet";
import {Service} from "./services/Service";
import {Services} from "./services/Services";

const {all} = promise;
const {print: puppet} = puppetConfig;


let logger = new Logger("critical");

(async (): Promise<void> => {
    let [configs, puppetConfigs] = await (all<any>([
        config(process.argv.slice(2)), puppet()
    ]) as Promise<[Object[], Map<string, string>]>);

    if (! configs.length) {
        throw new Error("Nothing to do");
    }

    let services: { [name: string]: Service; } = {};

    for (let config of configs) {
        if ("listen" in config) {
            if (typeof services.master !== "undefined") {
                throw new Error("More than one master service defined");
            }

            services.master = new Master(config as MasterConfig, puppetConfigs);
        } else {
            if (typeof services.agent !== "undefined") {
                throw new Error("More than one agent service defined");
            }

            services.agent = new Agent();
        }
    }

    let topService = new Services(
        services,
        typeof services.agent === "undefined" || typeof services.master === "undefined" ? {} : {agent: ["master"]}
    );

    await topService.start();

    let clear = tempEvents(process, {
        SIGTERM: shutdown,
        SIGINT: shutdown
    });

    function shutdown(): void {
        clear();
        topService.stop().catch(ultimaRatio);
    }
})().catch(ultimaRatio);

function ultimaRatio(reason: Error): void {
    process.exitCode = 1;
    logger.critical(reason);
}
