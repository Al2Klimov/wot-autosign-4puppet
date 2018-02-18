// For the terms of use see COPYRIGHT.md


export interface Service {
    start(): Promise<void>;

    stop(): Promise<void>;
}
