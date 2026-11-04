/**
 * Runtime-safe read-only registry.
 *
 * TypeScript's ReadonlyMap prevents mutation only at compile time; a Map can
 * still be changed through a cast or an untyped integration. This wrapper
 * exposes only the ReadonlyMap surface and keeps the mutable backing Map
 * private so a bootstrapped catalogue cannot be changed at runtime.
 */
export class ReadonlyRegistry<Key, Value> implements ReadonlyMap<Key, Value> {
  readonly #entries: Map<Key, Value>;

  constructor(entries: Iterable<readonly [Key, Value]>) {
    this.#entries = new Map(entries);
    Object.freeze(this);
  }

  get size(): number { return this.#entries.size; }
  get(key: Key): Value | undefined { return this.#entries.get(key); }
  has(key: Key): boolean { return this.#entries.has(key); }
  entries(): MapIterator<[Key, Value]> { return this.#entries.entries(); }
  keys(): MapIterator<Key> { return this.#entries.keys(); }
  values(): MapIterator<Value> { return this.#entries.values(); }
  forEach(callbackfn: (value: Value, key: Key, map: ReadonlyMap<Key, Value>) => void, thisArg?: unknown): void {
    this.#entries.forEach((value, key) => callbackfn.call(thisArg, value, key, this));
  }
  [Symbol.iterator](): MapIterator<[Key, Value]> { return this.#entries[Symbol.iterator](); }
  get [Symbol.toStringTag](): string { return "ReadonlyRegistry"; }
}

export function createReadonlyRegistry<Key, Value>(
  entries: Iterable<readonly [Key, Value]>,
): ReadonlyMap<Key, Value> {
  return new ReadonlyRegistry(entries);
}
