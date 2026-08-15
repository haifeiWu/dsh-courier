import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Mailbox } from "../lib/mailbox.js";

function record(overrides = {}) {
  return {
    from: { role: "coder", sessionId: "s1" },
    to: { role: null, sessionId: "s2" },
    content: "hello",
    ...overrides
  };
}

function tempPath() {
  return join(mkdtempSync(join(tmpdir(), "mailbox-")), "mailbox.jsonl");
}

test("enqueue appends a JSONL line and returns a pending record", () => {
  const path = tempPath();
  const mailbox = new Mailbox(path);
  const out = mailbox.enqueue(record());
  assert.equal(out.state, "pending");
  assert.equal(typeof out.id, "string");
  assert.equal(out.deliveredAt, null);
  const lines = readFileSync(path, "utf8").trim().split("\n");
  assert.equal(lines.length, 1);
  assert.equal(JSON.parse(lines[0]).id, out.id);
});

test("load replays pending records from an existing file", () => {
  const path = tempPath();
  const first = new Mailbox(path);
  const a = first.enqueue(record({ content: "one" }));
  const b = first.enqueue(record({ content: "two" }));
  const second = new Mailbox(path);
  second.load();
  assert.deepEqual(second.pendingFor("s2").map((r) => r.id), [a.id, b.id]);
});

test("corrupt lines are skipped with a warning and valid lines survive", () => {
  const path = tempPath();
  const first = new Mailbox(path);
  const a = first.enqueue(record());
  writeFileSync(path, "not-json\n" + readFileSync(path, "utf8"), "utf8");
  const warns = [];
  const second = new Mailbox(path, (m) => warns.push(m));
  second.load();
  assert.equal(warns.length, 1);
  assert.deepEqual(second.pendingFor("s2").map((r) => r.id), [a.id]);
});

test("markDelivered appends a state line and reload reflects delivery", () => {
  const path = tempPath();
  const first = new Mailbox(path);
  const a = first.enqueue(record());
  first.markDelivered(a.id, 123);
  assert.equal(a.state, "delivered");
  assert.equal(first.pendingFor("s2").length, 0);
  const second = new Mailbox(path);
  second.load();
  assert.equal(second.pendingFor("s2").length, 0);
  assert.equal(second.records.get(a.id).deliveredAt, 123);
});

test("pending queues are per-recipient and FIFO", () => {
  const path = tempPath();
  const mailbox = new Mailbox(path);
  const a = mailbox.enqueue(record({ to: { role: null, sessionId: "s2" }, content: "a" }));
  const b = mailbox.enqueue(record({ to: { role: null, sessionId: "s3" }, content: "b" }));
  const c = mailbox.enqueue(record({ to: { role: null, sessionId: "s2" }, content: "c" }));
  assert.deepEqual(mailbox.pendingFor("s2").map((r) => r.id), [a.id, c.id]);
  assert.deepEqual(mailbox.pendingFor("s3").map((r) => r.id), [b.id]);
});

test("markDelivered on unknown id throws", () => {
  const mailbox = new Mailbox(tempPath());
  assert.throws(() => mailbox.markDelivered("nope"), /unknown message/);
});

test("write failure warns but the record stays in memory", () => {
  const path = tempPath();
  mkdirSync(path);
  const warns = [];
  const mailbox = new Mailbox(path, (m) => warns.push(m));
  const out = mailbox.enqueue(record());
  assert.equal(warns.length, 1);
  assert.equal(mailbox.records.get(out.id).state, "pending");
});
