(function (root) {
  "use strict";
  class CloudProfile {
    constructor(
      engine,
      { fetchFn = (...args) => root.fetch(...args), onRemote = () => {} } = {},
    ) {
      this.engine = engine;
      this.engine.data.watchlistAddedAt ||= {};
      this.fetchFn = fetchFn;
      this.onRemote = onRemote;
      this.ready = false;
      this.timer = null;
      this.inFlight = false;
      this.dirty = false;
      this.engine.onSave = () => this.changed();
    }
    records() {
      const d = this.engine.data;
      return this.engine.items
        .filter(
          (i) =>
            d.decisions[i.rank] ||
            d.watched[i.rank] ||
            d.good[i.rank] ||
            (i.knownLiked && d.good[i.rank] === false) ||
            d.feedbackAt[i.rank],
        )
        .map((i) => ({
          workId: i.rank,
          decision: d.decisions[i.rank] || null,
          watched: d.watched[i.rank] || null,
          good: !!d.good[i.rank],
          updatedAt: d.feedbackAt[i.rank] || 1,
          addedAt: d.decisions[i.rank] === "like" ? d.watchlistAddedAt[i.rank] || d.feedbackAt[i.rank] || 1 : null,
        }));
    }
    status(text) {
      const box = document.getElementById("profile-sync");
      if (box) box.textContent = root.ProfileSync && !root.ProfileSync.config() ? "Только этот браузер · Настроить синхронизацию" : text;
    }
    async request(options) {
      const controller = new AbortController(),
        timer = setTimeout(() => controller.abort(), 10000);
      try {
        return await (root.ProfileSync ? root.ProfileSync.request.bind(root.ProfileSync) : (options) => this.fetchFn("/api/profile", options))({
          ...options,
          signal: controller.signal,
          credentials: "same-origin",
        });
      } finally {
        clearTimeout(timer);
      }
    }
    merge(records) {
      const d = this.engine.data,
        ids = new Set(this.engine.items.map((i) => i.rank));
      let changed = false;
      for (const r of records) {
        if (
          !ids.has(r.workId) ||
          !Number.isSafeInteger(r.updatedAt) ||
          r.updatedAt < (d.feedbackAt[r.workId] || 0)
        )
          continue;
        if (
          ![null, "like", "dislike"].includes(r.decision) ||
          ![null, "like", "dislike"].includes(r.watched) ||
          typeof r.good !== "boolean"
        )
          continue;
        if (
          (d.decisions[r.workId] || null) === r.decision &&
          (d.watched[r.workId] || null) === r.watched &&
          !!d.good[r.workId] === r.good &&
          d.feedbackAt[r.workId] === r.updatedAt &&
          (r.addedAt == null || d.watchlistAddedAt[r.workId] === r.addedAt)
        )
          continue;
        for (const field of ["decision", "watched"]) {
          const target = field === "decision" ? d.decisions : d.watched;
          if (r[field]) target[r.workId] = r[field];
          else delete target[r.workId];
        }
        d.good[r.workId] = r.good;
        d.feedbackAt[r.workId] = r.updatedAt;
        if (r.decision === "like") d.watchlistAddedAt[r.workId] = r.addedAt || d.watchlistAddedAt[r.workId] || r.updatedAt;
        else delete d.watchlistAddedAt[r.workId];
        changed = true;
      }
      if (changed) {
        const handler = this.engine.onSave;
        this.engine.onSave = null;
        this.engine.save();
        this.engine.onSave = handler;
      }
      return changed;
    }
    async start(initial = null) {
      try {
        const response = await (initial || this.request());
        if (!response.ok) throw Error("profile-read");
        const data = await response.json();
        if (!Array.isArray(data.records)) throw Error("profile-schema");
        const changed = this.merge(data.records);
        // Old browser ratings without a timestamp are imported once, while seed defaults remain older than explicit feedback.
        for (const r of this.records())
          if (r.updatedAt === 1 && (r.decision || r.watched))
            this.engine.data.feedbackAt[r.workId] = Date.now();
        this.ready = true;
        this.lastSent = "";
        if (changed) this.onRemote();
        this.changed();
      } catch {
        this.status("Нет связи · сохранено локально");
      }
    }
    async pull() {
      if (!this.ready || this.inFlight) return;
      if (this.dirty) await this.flush();
      try {
        const response = await this.request();
        if (!response.ok) throw Error("profile-read");
        const data = await response.json();
        if (!Array.isArray(data.records)) throw Error("profile-schema");
        if (this.merge(data.records)) this.onRemote();
      } catch { this.status("Нет связи · сохранено локально"); }
    }
    changed() {
      if (!this.ready) return;
      const fingerprint = JSON.stringify(this.records());
      if (fingerprint === this.lastSent) return;
      this.dirty = true;
      this.status("Сохраняю отметки…");
      clearTimeout(this.timer);
      this.timer = setTimeout(() => this.flush(), 1200);
    }
    async flush() {
      if (!this.ready || this.inFlight || !this.dirty) return;
      clearTimeout(this.timer);
      this.inFlight = true;
      this.dirty = false;
      const records = this.records(),
        fingerprint = JSON.stringify(records);
      try {
        const response = await this.request({
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ records }),
          keepalive: true,
        });
        if (!response.ok) throw Error("profile-write");
        const result = await response.json();
        if (Array.isArray(result.records) && this.merge(result.records)) this.onRemote();
        this.lastSent = fingerprint;
        this.status("Отметки синхронизированы");
      } catch {
        this.dirty = true;
        this.status("Нет связи · сохранено локально");
      } finally {
        this.inFlight = false;
        if (this.dirty && JSON.stringify(this.records()) !== fingerprint)
          this.changed();
      }
    }
  }
  root.CloudProfile = CloudProfile;
})(window);
