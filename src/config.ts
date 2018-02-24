// For the terms of use see COPYRIGHT.md


import {Validator} from "jsonschema";
import {fs, promise} from "./util/misc";
import {join} from "path";
import {fs as promisifiedFs} from "./util/promisified";

const {readdir, stat} = promisifiedFs;
const {all} = promise;
const {readFile} = fs;


type AgentNames = string[] | string;

interface Logging {
    level: "critical" | "error" | "warning" | "info" | "debug";
}

export interface MasterConfig {
    listen: {
        address: string;
        port: number;
    }[];

    web_of_trust: {
        trustee: AgentNames;
        responsible: AgentNames;
    }[];

    logging: Logging;
    datadir: string;
}

export interface AgentConfig {
    csrdir: string;
    datadir: string;
    logging: Logging;

    master: {
        host: string;
        port: number;
    };
}

let configValidator = new Validator();

let port = {
    type: "integer",
    minimum: 0,
    maximum: 65535
};

let agentNames = {
    oneOf: [
        {
            title: "Puppet agent CNs list",
            type: "array",
            minItems: 1,
            items: {type: "string"}
        },
        {
            title: "Puppet agent CNs regex",
            type: "string",
            format: "regex"
        }
    ]
};

let logging = objectAllRequired({level: {enum: ["critical", "error", "warning", "info", "debug"]}});

let schema = {
    oneOf: [
        objectAllRequired(
            {
                listen: array(1, objectAllRequired({
                    address: {
                        type: "string",
                        oneOf: [
                            {
                                title: "IPv4 address",
                                format: "ipv4"
                            },
                            {
                                title: "IPv6 address",
                                format: "ipv6"
                            }
                        ]
                    },
                    port: port
                })),
                web_of_trust: {
                    type: "array",
                    items: objectAllRequired({
                        trustee: agentNames,
                        responsible: agentNames
                    })
                },
                logging: logging,
                datadir: {type: "string"}
            },
            {title: "Master config"}
        ),
        objectAllRequired(
            {
                csrdir: {type: "string"},
                datadir: {type: "string"},
                logging: logging,
                master: objectAllRequired({
                    host: {
                        type: "string",
                        format: "idn-hostname"
                    },
                    port: port
                })
            },
            {title: "Agent config"}
        )
    ]
};

let jsonFile = /.\.json$/i;

interface Reading {
    path: string;
    reading?: Promise<string>;
    content?: string;
    parsed?: Object;
}

export async function load(paths: string[]): Promise<(MasterConfig | AgentConfig)[]> {
    let readings: Reading[] = [];

    await collectReadings(paths, readings, 0);

    for (let reading of readings) {
        reading.content = await reading.reading;
        reading.reading = undefined;
    }

    for (let reading of readings) {
        try {
            reading.parsed = JSON.parse(reading.content as string)
        } catch (e) {
            throw new Error("Invalid JSON in " + JSON.stringify(reading.path));
        }

        reading.content = undefined;
    }

    for (let reading of readings) {
        configValidator.validate(reading.parsed, schema, {
            propertyName: "JSON.parse(fs.readFileSync(" + JSON.stringify(reading.path) + ', "utf8"))'
        }).errors.forEach((e: Error): never => {
            throw e;
        });
    }

    return readings.map((reading: Reading): MasterConfig | AgentConfig => reading.parsed as MasterConfig | AgentConfig);
}

function array(minItems: number, items: Object): Object {
    return {
        type: "array",
        minItems: minItems,
        items: items
    };
}

function objectAllRequired(properties: Object, params: Object = {}): Object {
    return Object.assign(
        {
            type: "object",
            required: Object.getOwnPropertyNames(properties),
            properties: properties
        },
        params
    );
}

async function collectReadings(paths: string[], dest: Reading[], level: number): Promise<void> {
    await all(paths.map((path: string): Promise<void> => (async (): Promise<void> => {
        let stats = await stat(path);

        if (stats.isDirectory()) {
            await collectReadings(
                (await readdir(path)).map((subPath: string): string => join(path, subPath)),
                dest,
                level + 1
            );
        } else if (level === 0 || (stats.isFile() && jsonFile.exec(path) !== null)) {
            dest.push({
                path: path,
                reading: readFile(path, "utf8"),
                content: undefined,
                parsed: undefined
            });
        }
    })()));
}
