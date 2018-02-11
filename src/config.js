// For the terms of use see COPYRIGHT.md


const {fs: {readdir, stat}} = require("./util/promisified");
const {Validator} = require("jsonschema");
const {join} = require("path");

const {
    fs: {readFile},
    Promise: {all}
} = require("./util/misc");


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
                db: {type: "string"},
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

exports.load = async paths => {
    let readings = [];

    await collectReadings(paths, readings, 0);

    for (let reading of readings) {
        reading.content = await reading.reading;
        reading.reading = undefined;
    }

    for (let reading of readings) {
        try {
            reading.parsed = JSON.parse(reading.content)
        } catch (e) {
            throw new Error("Invalid JSON in " + JSON.stringify(reading.path));
        }

        reading.content = undefined;
    }

    for (let reading of readings) {
        configValidator.validate(reading.parsed, schema, {
            propertyName: "JSON.parse(fs.readFileSync(" + JSON.stringify(reading.path) + ', "utf8"))'
        }).errors.forEach(e => {
            throw e;
        });
    }

    return readings.map(reading => reading.parsed);
};

function array(minItems, items) {
    return {
        type: "array",
        minItems: minItems,
        items: items
    };
}

function objectAllRequired(properties, params) {
    return Object.assign(
        {
            type: "object",
            required: Object.getOwnPropertyNames(properties),
            properties: properties
        },
        typeof params === "undefined" ? {} : params
    );
}

async function collectReadings(paths, dest, level) {
    await all(paths.map(path => (async () => {
        let stats = await stat(path);

        if (stats.isDirectory()) {
            await collectReadings(
                (await readdir(path)).map(subPath => join(path, subPath)),
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
