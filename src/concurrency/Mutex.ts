// For the terms of use see COPYRIGHT.md


import {Semaphore} from "./Semaphore";


export class Mutex extends Semaphore {
    public constructor() {
        super(1);
    }
}
