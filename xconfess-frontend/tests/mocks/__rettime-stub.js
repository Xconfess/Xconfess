class TypedEvent {
  constructor(type, init) {
    this.type = type;
    Object.assign(this, init);
  }
}

class Emitter {
  constructor() { this._listeners = new Map(); }
  on(type, fn) { const s = this._listeners.get(type) || new Set(); s.add(fn); this._listeners.set(type, s); return () => s.delete(fn); }
  emit(event) { const s = this._listeners.get(event.type); if (s) for (const fn of s) fn(event); return !!s; }
  removeAllListeners() { this._listeners.clear(); }
}

class LensList {
  constructor() { this._items = []; }
  prepend(item) { this._items.unshift(item); return () => { this._items = this._items.filter(i => i !== item); }; }
  [Symbol.iterator]() { return this._items[Symbol.iterator](); }
}

module.exports = { TypedEvent, Emitter, LensList };
