(function (root) {
  "use strict";
  class Discovery {
    constructor(items, storage, random = Math.random, seeds = []) {
      this.items = items;
      this.seeds = seeds;
      this.storage = storage;
      this.random = random;
      const saved = this.read("dc-state-v2", {});
      this.data = {
        decisions: {},
        watched: {},
        good: {},
        seedGood: {},
        collectionsVersion: 2,
        seen: [],
        deferred: [],
        sound: true,
        mode: "random",
        feedType: "all",
        ...saved,
      };
      if (
        !this.data.decisions ||
        typeof this.data.decisions !== "object" ||
        Array.isArray(this.data.decisions)
      )
        this.data.decisions = {};
      if (
        !this.data.watched ||
        typeof this.data.watched !== "object" ||
        Array.isArray(this.data.watched)
      )
        this.data.watched = {};
      if (
        !this.data.good ||
        typeof this.data.good !== "object" ||
        Array.isArray(this.data.good)
      )
        this.data.good = {};
      if (
        !this.data.seedGood ||
        typeof this.data.seedGood !== "object" ||
        Array.isArray(this.data.seedGood)
      )
        this.data.seedGood = {};
      if (!Array.isArray(this.data.seen)) this.data.seen = [];
      const ids = new Set(items.map((i) => i.rank));
      this.data.deferred = [
        ...new Set(
          (Array.isArray(this.data.deferred) ? this.data.deferred : []).filter(
            (id) => ids.has(id),
          ),
        ),
      ];
      if (
        !["all", "series", "film", "game", "adult", "papich", "watchlist"].includes(
          this.data.feedType,
        )
      )
        this.data.feedType = "all";
      if (!["ordered", "random"].includes(this.data.mode))
        this.data.mode = "random";
      if (saved.discoveryPolicy !== 2) {
        this.data.mode = "random";
        this.data.feedType = "all";
        this.data.discoveryPolicy = 2;
      }
      const old = this.read("darkcomedy-saved-v1", []);
      if (Array.isArray(old))
        old.forEach((id) => {
          if (!this.data.decisions[id]) this.data.decisions[id] = "like";
        });
      // Bookmarks and watched likes remain separate collections and both inform taste.
      if (saved.collectionsVersion !== 2) {
        this.data.good = {};
        this.data.collectionsVersion = 2;
        this.data.mode = "random";
      }
      for (const item of items) {
        if (typeof this.data.good[item.rank] !== "boolean")
          this.data.good[item.rank] =
            this.data.watched[item.rank] === "like" ||
            (!this.data.watched[item.rank] &&
              String(item.status || "").includes("в целом зашло"));
      }
      if (saved.profileSchema !== 3) {
        for (const seed of seeds) {
          if (!seed.canonicalRank) continue;
          const id = seed.canonicalRank;
          this.data.good[id] =
            this.data.seedGood[seed.id] !== false &&
            this.data.watched[id] !== "dislike" &&
            this.data.decisions[id] !== "dislike";
        }
        this.data.profileSchema = 3;
      }
      this.data.feedbackAt = this.data.feedbackAt || {};
      this.data.watchlistAddedAt = this.data.watchlistAddedAt || {};
      for (const [id, decision] of Object.entries(this.data.decisions)) {
        if (decision === "like" && !this.data.watchlistAddedAt[id])
          this.data.watchlistAddedAt[id] = this.data.feedbackAt[id] || 1;
      }
      this.lastShownId = null;
      this.sequenceAfter = 0;
      this.sequenceServed = new Set();
      this.unavailable = new Set();
      this.history = [];
      this.batch = [];
      this.pos = 0;
    }
    read(key, fallback) {
      try {
        return JSON.parse(this.storage.getItem(key)) ?? fallback;
      } catch {
        return fallback;
      }
    }
    save() {
      this._tasteProfile = null;
      try {
        this.storage.setItem("dc-state-v2", JSON.stringify(this.data));
        this.storage.setItem(
          "darkcomedy-saved-v1",
          JSON.stringify(
            Object.keys(this.data.decisions)
              .filter((k) => this.data.decisions[k] === "like")
              .map(Number),
          ),
        );
      } catch {}
      this.onSave?.();
    }
    decide(id, value) {
      const now = Date.now(), oldAddedAt = this.data.watchlistAddedAt[id];
      if (value === "like" && this.data.decisions[id] !== "like") this.data.watchlistAddedAt[id] = now;
      else if (value !== "like") delete this.data.watchlistAddedAt[id];
      this.data.feedbackAt[id] = now;
      this.history.push({
        id,
        old: this.data.decisions[id],
        oldAddedAt,
        oldGood: this.data.good[id],
        oldWatched: this.data.watched[id],
      });
      if (value === "like") {
        delete this.data.watched[id];
        this.data.good[id] = false;
      }
      if (value) this.data.decisions[id] = value;
      else delete this.data.decisions[id];
      if (value === "dislike") this.data.good[id] = false;
      this.save();
    }
    markWatched(id, value) {
      this.data.feedbackAt[id] = Date.now();
      this.history.push({
        id,
        old: this.data.watched[id],
        oldGood: this.data.good[id],
        kind: "watched",
        oldDecision: this.data.decisions[id],
      });
      if (value && this.data.decisions[id] === "dislike") delete this.data.decisions[id];
      if (value) this.data.watched[id] = value;
      else delete this.data.watched[id];
      this.data.good[id] = value === "like";
      this.save();
    }
    setGood(id, value) {
      const alias = this.seeds.find((s) => s.id === id && s.canonicalRank);
      if (alias) id = alias.canonicalRank;
      const seeded = this.seeds.some((i) => i.id === id),
        target = seeded ? this.data.seedGood : this.data.good;
      this.history.push({
        id,
        old: target[id],
        kind: seeded ? "seed" : "good",
      });
      target[id] = Boolean(value);
      if (!seeded) this.data.feedbackAt[id] = Date.now();
      this.save();
    }
    isGood(id) {
      return this.data.good[id] === true;
    }
    isRejected(id) {
      return (
        this.data.watched[id] === "dislike" ||
        this.data.decisions[id] === "dislike" ||
        (this.data.watched[id] === "like" && this.data.good[id] === false)
      );
    }
    isUndecided(item) {
      return (
        !item.status &&
        !this.data.decisions[item.rank] &&
        !this.data.watched[item.rank] &&
        !this.isGood(item.rank)
      );
    }
    restoreRejected(id) {
      if (!this.isRejected(id)) return;
      delete this.data.decisions[id];
      delete this.data.watched[id];
      this.data.good[id] = false;
      this.data.feedbackAt[id] = Date.now();
      this.save();
    }
    goodItems() {
      const result = [
        ...this.seeds.filter(
          (i) => !i.canonicalRank && this.data.seedGood[i.id] !== false,
        ),
        ...this.items.filter((i) => this.isGood(i.rank)),
      ];
      return result.filter(
        (i, n) =>
          result.findIndex(
            (x) =>
              (x.canonicalRank || x.rank || x.id) ===
              (i.canonicalRank || i.rank || i.id),
          ) === n,
      );
    }
    undo() {
      const last = this.history.pop();
      if (!last) return null;
      const target =
        last.kind === "seed"
          ? this.data.seedGood
          : last.kind === "good"
            ? this.data.good
            : last.kind === "watched"
              ? this.data.watched
              : this.data.decisions;
      if (last.old !== undefined) target[last.id] = last.old;
      else delete target[last.id];
      if (Object.hasOwn(last, "oldWatched")) {
        if (last.oldWatched !== undefined) this.data.watched[last.id] = last.oldWatched;
        else delete this.data.watched[last.id];
      }
      if (Object.hasOwn(last, "oldDecision")) {
        if (last.oldDecision !== undefined) this.data.decisions[last.id] = last.oldDecision;
        else delete this.data.decisions[last.id];
      }
      if (!["good", "seed"].includes(last.kind)) {
        if (last.oldGood !== undefined) this.data.good[last.id] = last.oldGood;
        else delete this.data.good[last.id];
      }
      if (!last.kind) {
        if (last.oldAddedAt != null) this.data.watchlistAddedAt[last.id] = last.oldAddedAt;
        else delete this.data.watchlistAddedAt[last.id];
      }
      this.data.feedbackAt[last.id] = Date.now();
      this.save();
      return last.id;
    }
    tasteProfile() {
      if (this._tasteProfile) return this._tasteProfile;
      const tagCache = new WeakMap();
      const getTags = (i) =>
        typeof Library !== "undefined"
          ? Library.tasteTags(i)
          : [
              ...new Set(
                (i.tags || [])
                  .filter((t) => !/(?:18\+|обнаж|nudity|эротик)/i.test(t))
                  .map((t) => String(t).trim().toLowerCase()),
              ),
            ];
      const tags = (item) => {
        if (!tagCache.has(item)) tagCache.set(item, getTags(item));
        return tagCache.get(item);
      };
      const counts = new Map();
      [...this.items, ...this.seeds].forEach((i) =>
        tags(i).forEach((t) => counts.set(t, (counts.get(t) || 0) + 1)),
      );
      const positives = new Map(
        this.goodItems().map((i) => [i.rank || i.id, {
          item: i,
          weight: Math.max(1, Math.min(10, Number(i.tasteWeight) || 2.5)),
        }]),
      );
      for (const i of this.items)
        if (this.data.decisions[i.rank] === "like" && !positives.has(i.rank))
          positives.set(i.rank, { item: i, weight: 1 });
      const idfCache = new Map(), vectors = new WeakMap();
      const idf = (tag) => {
        if (!idfCache.has(tag)) idfCache.set(tag, Math.log(
          1 + (this.items.length + this.seeds.length) / (1 + (counts.get(tag) || 0)),
        ));
        return idfCache.get(tag);
      };
      const vector = (item) => {
        if (!vectors.has(item)) {
          const values = new Set(tags(item));
          vectors.set(item, {
            tags: values,
            norm: Math.sqrt([...values].reduce((sum, tag) => sum + idf(tag) ** 2, 0)),
            animated: /анимац|мульт/i.test([item.kind, ...(item.tags || [])].join(" ")),
            themes: new Set(typeof Library !== "undefined" ? Library.specificThemes(item) : []),
          });
        }
        return vectors.get(item);
      };
      return this._tasteProfile = {
        tags, idf, vector, matches: new WeakMap(),
        positive: [...positives.values()],
        negative: this.items.filter(
          (i) =>
            !this.isGood(i.rank) &&
            (this.data.watched[i.rank] === "dislike" ||
              this.data.decisions[i.rank] === "dislike"),
        ),
      };
    }
    tasteMatch(item, profile = this.tasteProfile()) {
      if (!profile.positive.length)
        return { score: 0, because: null, common: [] };
      if (profile.matches.has(item)) return profile.matches.get(item);
      const candidateVector = profile.vector(item),
        candidate = candidateVector.tags,
        candidateNorm = candidateVector.norm;
      const broad = new Set([
        "драма",
        "боевик",
        "комедия",
        "триллер",
        "фантастика",
        "фэнтези",
        "приключения",
        "мелодрама",
        "мульт",
        "анимация",
      ]);
      const sharedSpecific = (other) =>
        profile.tags(other).filter((t) => candidate.has(t) && !broad.has(t));
      const similarity = (other) => {
        if (other.rank && other.rank === item.rank) return 0;
        const otherVector = profile.vector(other),
          tags = otherVector.tags,
          denominator = candidateNorm * otherVector.norm;
        const shared = sharedSpecific(other);
        if (!shared.length) return 0;
        if (
          candidateVector.animated !== otherVector.animated &&
          !shared.some((t) => candidateVector.themes.has(t))
        )
          return 0;
        return denominator
          ? [...candidate].reduce(
              (sum, t) => sum + (tags.has(t) ? profile.idf(t) ** 2 : 0),
              0,
            ) / denominator
          : 0;
      };
      let total = 0,
        weights = 0,
        best = 0,
        because = null;
      for (const seed of profile.positive) {
        const match = similarity(seed.item);
        total += match * seed.weight;
        weights += seed.weight;
        if (match * seed.weight > best) {
          best = match * seed.weight;
          because = match >= 0.25 ? seed.item : null;
        }
      }
      const penalty = profile.negative.length
        ? profile.negative.reduce((sum, i) => sum + similarity(i), 0) /
          profile.negative.length
        : 0;
      const evidence = profile.positive
        .filter((seed) =>
          (item.recommendationEvidence || []).includes(seed.item.rank),
        )
        .sort((a, b) => b.weight - a.weight)[0];
      const connection = evidence && item.tasteConnections?.[evidence.item.rank];
      const explanation = connection?.reason || (evidence ? item.editorialWhy : null);
      if (explanation) because = evidence.item;
      const result = {
        score:
          Math.max(0, total / weights - 0.6 * penalty) +
          (explanation ? 0.15 : 0),
        explanation,
        caveat: connection?.caveat || item.caveat || null,
        because,
        common: because
          ? profile
              .tags(because)
              .filter((t) => candidate.has(t) && !broad.has(t))
              .sort((a, b) => profile.idf(b) - profile.idf(a))
              .slice(0, 3)
          : [],
      };
      profile.matches.set(item, result);
      return result;
    }
    personalSelection(limit = 100) {
      const profile = this.tasteProfile();
      return this.items
        .filter(
          (i) =>
            i.candidatePool &&
            i.discoveryEligible !== false &&
            !i.status &&
            !this.data.watched[i.rank] &&
            !this.data.decisions[i.rank],
        )
        .map((i) => ({ item: i, score: this.tasteMatch(i, profile).score }))
        .sort(
          (a, b) =>
            b.score - a.score ||
            (b.item.score || 0) - (a.item.score || 0) ||
            a.item.rank - b.item.rank,
        )
        .slice(0, limit)
        .map((x) => x.item);
    }
    freezeRecommendations() {
      let changed = false;
      if (!Array.isArray(this.data.recommendationCohort)) {
        this.data.recommendationCohort = this.recommendationItems().map((item) => item.rank);
        changed = true;
      }
      if (!Array.isArray(this.data.appliedRecommendationReleases))
        this.data.appliedRecommendationReleases = [];
      const available = new Map(this.items.map((item) => [item.rank, item]));
      const ids = new Set(this.data.recommendationCohort);
      for (const release of root.AppConfig?.recommendationReleases || []) {
        // Reconcile membership even if an old cached library marked this release applied.
        for (const rank of release.ranks) {
          if (available.has(rank) && available.get(rank).discoveryEligible !== false && !ids.has(rank)) {
            ids.add(rank);
            changed = true;
          }
        }
        if (release.ranks.every((rank) => available.has(rank)) &&
            !this.data.appliedRecommendationReleases.includes(release.id)) {
          this.data.appliedRecommendationReleases.push(release.id);
          changed = true;
        }
      }
      this.data.recommendationCohort = [...ids];
      if (changed) this.save();
    }
    recommendationItems() {
      if (Array.isArray(this.data.recommendationCohort)) {
        const ids = new Set(this.data.recommendationCohort);
        return this.items.filter((item) => ids.has(item.rank) && item.discoveryEligible !== false);
      }
      const pool = this.items.filter((i) => i.discoveryEligible !== false);
      const profile = this.tasteProfile();
      const limit = root.AppConfig?.recommendationLimit || 200;
      const selected = new Set(
        pool
          .filter((i) => this.isUndecided(i))
          .map((item) => ({
            item,
            score: this.tasteMatch(item, profile).score,
          }))
          .sort(
            (a, b) =>
              b.score - a.score ||
              (b.item.score || 0) - (a.item.score || 0) ||
              a.item.rank - b.item.rank,
          )
          .slice(0, limit)
          .map(({ item }) => item.rank),
      );
      return pool.filter((i) => selected.has(i.rank) || !this.isUndecided(i));
    }
    watchlistItems() {
      return this.items.filter((i) => this.data.decisions[i.rank] === "like" &&
        !this.data.watched[i.rank] && !i.status && !this.isGood(i.rank) && !this.isRejected(i.rank));
    }
    feedItems() {
      if (this.data.feedType === "watchlist") return this.watchlistItems();
      return this.data.feedType === "papich"
        ? this.items.filter(
            (i) => Number.isFinite(i.papichScore) && i.trailer?.videoId,
          )
        : this.recommendationItems();
    }
    catalogProgress() {
      const pool = this.recommendationItems();
      const remaining = pool.filter((i) => this.isUndecided(i)).length;
      const done = pool.length - remaining;
      return {
        total: pool.length,
        remaining,
        done,
        percent: pool.length ? Math.round((done / pool.length) * 100) : 0,
      };
    }
    progress() {
      if (this.data.feedType === "watchlist")
        return { done: 0, total: this.watchlistItems().length, percent: 0 };
      const pool = this.feedItems().filter(
          (i) =>
            i.trailer?.videoId &&
            (this.data.feedType === "all" ||
              this.data.feedType === "papich" ||
              this.data.feedType === "watchlist" ||
              i.type === this.data.feedType ||
              (this.data.feedType === "adult" && i.adult?.nudity)),
        ),
        done = pool.filter(
          (i) =>
            (this.data.feedType !== "watchlist" && this.data.decisions[i.rank]) ||
            this.data.watched[i.rank] ||
            i.status,
        ).length;
      return {
        done,
        total: pool.length,
        percent: pool.length ? Math.round((done / pool.length) * 100) : 0,
      };
    }
    eligible() {
      return this.feedItems().filter(
        (i) =>
          (this.data.feedType === "watchlist" || i.trailer?.videoId) &&
          !this.unavailable.has(i.rank) &&
          (this.data.feedType === "all" ||
            this.data.feedType === "papich" ||
            this.data.feedType === "watchlist" ||
            i.type === this.data.feedType ||
            (this.data.feedType === "adult" && i.adult?.nudity)) &&
          (this.data.feedType === "watchlist" || !this.data.decisions[i.rank]) &&
          (this.data.feedType === "watchlist" || (!this.data.watched[i.rank] && !i.status)),
      );
    }
    restart(afterRank = 0) {
      this.sequenceAfter = afterRank;
      const deferred = new Set(this.data.deferred);
      this.sequenceServed = new Set(
        this.items
          .filter((i) => i.rank <= afterRank && !deferred.has(i.rank))
          .map((i) => i.rank),
      );
    }
    defer(id) {
      const item = this.items.find((i) => i.rank === id);
      if (
        !item?.trailer?.videoId ||
        item.status ||
        (this.data.decisions[id] && this.data.feedType !== "watchlist") ||
        (this.data.watched[id] && this.data.feedType !== "watchlist")
      )
        return false;
      this.data.deferred = this.data.deferred.filter((rank) => rank !== id);
      this.data.deferred.push(id);
      this.sequenceServed.delete(id);
      this.save();
      return true;
    }
    compareQueue(a, b) {
      const x = this.data.deferred.indexOf(a.rank),
        y = this.data.deferred.indexOf(b.rank);
      return x < 0 && y < 0 ? a.rank - b.rank : x < 0 ? -1 : y < 0 ? 1 : x - y;
    }
    nextBatch() {
      const pool = this.eligible();
      if (this.data.mode === "ordered") {
        this.batch = pool
          .filter((i) => !this.sequenceServed.has(i.rank))
          .sort((a, b) => this.compareQueue(a, b))
          .slice(0, 10);
        for (const i of this.batch) this.sequenceServed.add(i.rank);
        if (this.batch.length) this.sequenceAfter = this.batch.at(-1).rank;
        this.pos = 0;
        this.save();
        return this.batch;
      }
      const deferred = new Set(this.data.deferred);
      let unseen = pool.filter(
        (i) => !this.data.seen.includes(i.rank) && !deferred.has(i.rank),
      );
      if (!unseen.length && pool.some((i) => deferred.has(i.rank))) {
        const revisit = pool.filter(
          (i) => !deferred.has(i.rank) && i.rank !== this.lastShownId,
        );
        if (revisit.length) {
          const ids = new Set(revisit.map((i) => i.rank));
          this.data.seen = this.data.seen.filter((id) => !ids.has(id));
          unseen = revisit;
        } else {
          this.batch = pool
            .filter((i) => deferred.has(i.rank))
            .sort((a, b) => this.compareQueue(a, b))
            .slice(0, 10);
          this.pos = 0;
          this.save();
          return this.batch;
        }
      }
      // Reset only the selected type's cycle, preserving progress in the other types.
      if (!unseen.length && pool.length) {
        const ids = new Set(pool.map((i) => i.rank));
        this.data.seen = this.data.seen.filter((id) => !ids.has(id));
        unseen = pool;
      }
      const profile = this.tasteProfile();
      this.batch = unseen
        .map((i) => ({
          i,
          key: Math.pow(
            Math.max(0.00001, this.random()),
            1 / (1 + 6 * this.tasteMatch(i, profile).score),
          ),
        }))
        .sort((a, b) => b.key - a.key)
        .slice(0, 10)
        .map((x) => x.i);
      this.pos = 0;
      this.save();
      return this.batch;
    }
    current() {
      return this.batch[this.pos] || null;
    }
    markShown(id) {
      this.lastShownId = id;
      if (!this.data.seen.includes(id)) {
        this.data.seen.push(id);
        this.save();
      }
    }
    advance() {
      this.pos++;
      if (this.pos >= this.batch.length) this.nextBatch();
      return this.current();
    }
  }
  if (typeof module !== "undefined") module.exports = Discovery;
  else root.Discovery = Discovery;
})(typeof window !== "undefined" ? window : globalThis);
