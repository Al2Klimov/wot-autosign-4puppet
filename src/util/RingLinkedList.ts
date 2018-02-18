// For the terms of use see COPYRIGHT.md


interface Link<T> {
    left: Link<T>;
    right: Link<T>;
}

class Item<T> implements Link<T> {
    public left: Link<T>;
    public right: Link<T>;
    public value: T;
    
    public constructor(left: Link<T>, value: T, right: Link<T>) {
        this.left = left;
        this.value = value;
        this.right = right;

        left.right = right.left = this;
    }

    public detach() {
        this.left.right = this.right;
        this.right.left = this.left;
        this.left = this.right = this;
    }
}

export class RingLinkedList<T> implements Link<T> {
    public left: Link<T>;
    public right: Link<T>;

    public constructor() {
        this.left = this.right = this;
    }

    public append(value: T): Item<T> {
        return new Item(this.left, value, this);
    }

    public *iter(): IterableIterator<Item<T>> {
        for (let current = this.right; current instanceof Item; current = current.right) {
            yield current;
        }
    }
}
