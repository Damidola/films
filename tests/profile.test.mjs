import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import vm from "node:vm";
import { DatabaseSync } from "node:sqlite";
import { profileResponse } from "../worker/profile.mjs";
const works = new Map([
  [1, { ru: "Корпорация" }],
  [2, { ru: "Тим" }],
]);
async function database() {
  const sql = new DatabaseSync(":memory:");
  const dir = new URL("../drizzle/", import.meta.url);
  for (const name of (await fs.readdir(dir)).filter((name) => name.endsWith(".sql")).sort())
    sql.exec(await fs.readFile(new URL(name, dir), "utf8"));
  const adapt = {
    prepare(text) {
      return {
        bind(...values) {
          return {
            all: async () => ({ results: sql.prepare(text).all(...values) }),
            run: async () => sql.prepare(text).run(...values),
          };
        },
      };
    },
    batch: async (statements) => {
      sql.exec("BEGIN");
      try {
        const r = [];
        for (const s of statements) r.push(await s.run());
        sql.exec("COMMIT");
        return r;
      } catch (e) {
        sql.exec("ROLLBACK");
        throw e;
      }
    },
  };
  return { sql, DB: adapt };
}
const req = (user, records, more = {}) =>
  new Request("https://site.test/api/profile", {
    method: records ? "PUT" : "GET",
    headers: {
      ...(user ? { "oai-authenticated-user-id": user } : {}),
      ...(records
        ? { "Content-Type": "application/json", Origin: "https://site.test" }
        : {}),
      ...more,
    },
    ...(records ? { body: JSON.stringify({ records }) } : {}),
  });
const record = (workId, updatedAt, more = {}) => ({
  workId,
  updatedAt,
  decision: null,
  watched: null,
  good: false,
  ...more,
});
test("single shared profile needs no identity; canonical titles and stale-device protection use actual SQLite", async () => {
  const env = await database();
  try {
    assert.equal((await profileResponse(req(null), env, works)).status, 200);
    const now = Date.now();
    const write = await profileResponse(
      req("alice", [
        record(1, now, { watched: "like", good: true, title: "untrusted" }),
      ]),
      env,
      works,
    );
    assert.equal(write.status, 200);
    const anonymous = await (
      await profileResponse(req(null), env, works)
    ).json();
    const signedIn = await (
      await profileResponse(req("bob"), env, works)
    ).json();
    assert.equal(anonymous.records[0].watched, "like");
    assert.deepEqual(signedIn.records, anonymous.records);
    assert.equal(anonymous.mode, "single-user");
    await profileResponse(
      req("alice", [record(1, now - 100, { decision: "dislike" })]),
      env,
      works,
    );
    let data = await (await profileResponse(req("alice"), env, works)).json();
    assert.equal(data.records[0].title, "Корпорация");
    assert.equal(data.records[0].watched, "like");
    assert.equal(data.records[0].good, true);
    await profileResponse(
      req("alice", [record(2, now, { decision: "like" })]),
      env,
      works,
    );
    data = await (await profileResponse(req("alice"), env, works)).json();
    assert.equal(data.records.length, 2);
    assert.match(
      (await profileResponse(req("alice"), env, works)).headers.get(
        "cache-control",
      ),
      /no-store/,
    );
  } finally {
    env.sql.close();
  }
});
test("profile rejects foreign origins, invalid works and invalid timestamps without writing", async () => {
  const env = await database();
  try {
    const now = Date.now();
    for (const records of [
      [record(999, now)],
      [record(1, now + 600000)],
      [record(1, now, { good: "true" })],
      [record(1, now), record(1, now)],
    ])
      assert.equal(
        (await profileResponse(req("alice", records), env, works)).status,
        400,
      );
    assert.equal(
      (
        await profileResponse(
          req("alice", [record(1, now)], { Origin: "https://other.test" }),
          env,
          works,
        )
      ).status,
      403,
    );
    assert.deepEqual(
      (await (await profileResponse(req("alice"), env, works)).json()).records,
      [],
    );
  } finally {
    env.sql.close();
  }
});
test("browser cloud profile merges server feedback, imports old local likes and uploads later changes", async () => {
  const nodes = new Map();
  const document = {
    getElementById: (id) => {
      if (!nodes.has(id))
        nodes.set(id, { replaceChildren() {}, append() {}, textContent: "" });
      return nodes.get(id);
    },
    createElement: () => ({}),
  };
  const requests = [],
    data = { decisions: { 1: "like" }, watched: {}, good: {}, feedbackAt: {} };
  const engine = {
    data,
    items: [{ rank: 1 }, { rank: 2 }],
    save() {
      this.onSave?.();
    },
  };
  const box = {
    window: {},
    document,
    AbortController,
    setTimeout,
    clearTimeout,
  };
  vm.runInNewContext(
    await fs.readFile(
      new URL("../dist/repositories/profile.js", import.meta.url),
      "utf8",
    ),
    box,
  );
  const sync = new box.window.CloudProfile(engine, {
    fetchFn: async (url, options = {}) => {
      requests.push(options);
      return Response.json(
        options.method === "PUT"
          ? { savedAt: Date.now() }
          : {
              userId: "alice",
              records: [
                record(2, Date.now() - 100, { watched: "like", good: true }),
              ],
            },
      );
    },
  });
  await sync.start();
  await sync.flush();
  assert.equal(data.decisions[1], "like");
  assert.equal(data.watched[2], "like");
  assert.equal(data.good[2], true);
  assert.ok(data.feedbackAt[1] > 1);
  data.decisions[1] = "dislike";
  data.feedbackAt[1] = Date.now();
  engine.save();
  await sync.flush();
  const payload = JSON.parse(
    requests.filter((x) => x.method === "PUT").at(-1).body,
  );
  assert.equal(payload.records.find((r) => r.workId === 1).decision, "dislike");
  assert.match(nodes.get("profile-sync").textContent, /синхронизированы/);
  clearTimeout(sync.timer);
});
