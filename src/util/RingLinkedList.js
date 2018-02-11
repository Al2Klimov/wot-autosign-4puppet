// For the terms of use see COPYRIGHT.md


const stopMarker = Symbol();

class Item {
    constructor(prev, value, next) {
        this.prev = prev;
        this._value = value;
        this.next = next;

        prev.next = next.prev = this;
    }

    get value() {
        return this._value;
    }

    set value(value) {
        this._value = value;
    }

    detach() {
        this.prev.next = this.next;
        this.next.prev = this.prev;
        this.prev = this.next = this;
    }
}

module.exports = class {
    constructor() {
        let ring = new Item({next: undefined}, stopMarker, {prev: undefined});
        ring.prev = ring.next = ring;

        this.ring = ring;
    }

    append(value) {
        return new Item(this.ring.prev, value, this.ring);
    }

    *iter() {
        for (let current = this.ring.next; current.value !== stopMarker; current = current.next) {
            yield current;
        }
    }
};
