/** Bounded cache and per-resource request coalescing, shared by every provider. */
export class ReviewCache {
  constructor({ limit = 160, now = Date.now } = {}) {
    this.limit = limit;
    this.now = now;
    this.values = new Map();
    this.pending = new Map();
  }
  get(key) {
    const row = this.values.get(key);
    if (!row || row.until <= this.now()) return null;
    this.values.delete(key);
    this.values.set(key, row);
    return row.data;
  }
  put(key, data) {
    this.values.delete(key);
    if (this.values.size >= this.limit)
      this.values.delete(this.values.keys().next().value);
    this.values.set(key, {
      data,
      until: this.now() + (data.status === "unavailable" ? 30000 : 900000),
    });
  }
  coalesce(key, fn) {
    if (this.pending.has(key)) return this.pending.get(key);
    const pending = Promise.resolve()
      .then(fn)
      .finally(() => this.pending.delete(key));
    this.pending.set(key, pending);
    return pending;
  }
}
