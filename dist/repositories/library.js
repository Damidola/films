(function (root) {
  "use strict";
  class LibraryRepository {
    constructor({
      fetchFn = (...args) => root.fetch(...args),
      url = "library.json?v=90",
    } = {}) {
      this.fetchFn = fetchFn;
      this.url = url;
      this.pending = null;
    }
    load() {
      if (!this.pending)
        this.pending = this.fetchFn(this.url, { cache: "no-cache" })
          .then((r) => {
            if (!r.ok) throw Error("library-network");
            return r.json();
          })
          .then((data) => {
            if (
              data.schemaVersion !== 1 ||
              !Array.isArray(data.items) ||
              !Array.isArray(data.seeds)
            )
              throw Error("library-schema");
            const ids = new Set();
            for (const i of data.items) {
              if (!Number.isInteger(i.rank) || i.rank < 1 || ids.has(i.rank))
                throw Error("library-identity");
              ids.add(i.rank);
            }
            for (const seed of data.seeds)
              if (seed.canonicalRank && !ids.has(seed.canonicalRank))
                throw Error("library-seed-reference");
            return data;
          })
          .catch((e) => {
            this.pending = null;
            throw e;
          });
      return this.pending;
    }
  }
  root.LibraryRepository = LibraryRepository;
})(window);
