// For the terms of use see COPYRIGHT.md


export function agentNames2Filter(agentNames: string[] | string): (agentName: string) => boolean {
    if (agentNames instanceof Array) {
        let agents = new Set<string>(agentNames);
        return (agentName: string): boolean => agents.has(agentName);
    }

    let agents = new RegExp(agentNames);
    return (agentName: string): boolean => agents.exec(agentName) !== null;
}
