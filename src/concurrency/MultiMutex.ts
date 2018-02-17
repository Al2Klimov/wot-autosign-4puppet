// For the terms of use see COPYRIGHT.md


import {MultiSemaphore} from "./MultiSemaphore";


export class MultiMutex extends MultiSemaphore {
    public constructor() {
        super(1);
    }
}
