// For the terms of use see COPYRIGHT.md


module.exports = {
    agentNames2Filter: agentNames => {
        if (agentNames instanceof Array) {
            agentNames = new Set(agentNames);
            return agentName => agentNames.has(agentName);
        }

        agentNames = new RegExp(agentNames);
        return agentName => agentNames.exec(agentName) !== null;
    }
};
