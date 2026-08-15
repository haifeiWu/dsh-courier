import { test } from "node:test";
import assert from "node:assert/strict";
import { Context } from "@deepseek-ai/cordis";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Courier } from "../lib/courier.js";
import { Mailbox } from "../lib/mailbox.js";
import { RoleRegistry } from "../lib/registry.js";

function fakeAgent(id, followup) {
  return { id, followup: followup ?? (() => {}) };
}

function setup() {
  const ctx = new Context();
  const agents = new Map();
  ctx.provide("agents", {
    get: (id) => agents.get(id),
    list: () => [...agents.values()],
  });
  ctx.provide("sessions", {});
  const dir = mkdtempSync(join(tmpdir(), "courier-"));
  const warns = [];
  const mailbox = new Mailbox(join(dir, "mailbox.jsonl"));
  const registry = new RoleRegistry(join(dir, "roles.json"));
  const courier = new Courier(ctx, { mailbox, registry, warn: (m) => warns.push(m) });
  return { ctx, agents, mailbox, registry, courier, warns };
}

test("send to a registered live role delivers and wakes the agent", async () => {
  const { agents, mailbox, registry, courier } = setup();
  const received = [];
  agents.set("s2", fakeAgent("s2", (message) => received.push(message)));
  registry.bind("coder", "s1");
  registry.bind("reviewer", "s2");
  const result = await courier.send(fakeAgent("s1"), { toRole: "reviewer", message: "请评审" });
  assert.equal(result.delivered, true);
  assert.equal(result.queued, false);
  assert.equal(typeof result.messageId, "string");
  assert.equal(received.length, 1);
  assert.match(received[0].content[0].text, /^\[courier coder s1\]/);
  assert.equal(received[0].source.kind, "courier");
  assert.equal(received[0].source.senderSessionId, "s1");
  assert.equal(mailbox.pendingFor("s2").length, 0);
});

test("send to a registered offline role queues the message", async () => {
  const { mailbox, registry, courier } = setup();
  registry.bind("reviewer", "s2");
  const result = await courier.send(fakeAgent("s1"), { toRole: "reviewer", message: "稍后评审" });
  assert.equal(result.queued, true);
  assert.equal(result.delivered, false);
  assert.equal(mailbox.pendingFor("s2").length, 1);
});

test("send requires exactly one of to_role or to_session_id", async () => {
  const { courier } = setup();
  await assert.rejects(courier.send(fakeAgent("s1"), { message: "x" }), /exactly one/);
  await assert.rejects(
    courier.send(fakeAgent("s1"), { toRole: "coder", toSessionId: "s2", message: "x" }),
    /exactly one/
  );
});

test("send to an unregistered role throws and lists registered roles", async () => {
  const { registry, courier } = setup();
  registry.bind("coder", "s1");
  await assert.rejects(
    courier.send(fakeAgent("s9"), { toRole: "nobody", message: "x" }),
    /not registered.*coder/
  );
});

test("session/created flush delivers queued messages in FIFO order", async () => {
  const { ctx, agents, mailbox, registry, courier } = setup();
  registry.bind("reviewer", "s2");
  await courier.send(fakeAgent("s1"), { toRole: "reviewer", message: "one" });
  await courier.send(fakeAgent("s1"), { toRole: "reviewer", message: "two" });
  const received = [];
  agents.set("s2", fakeAgent("s2", (m) => received.push(m)));
  ctx.emit("session/created", { id: "s2" });
  await new Promise((resolve) => setTimeout(resolve, 20));
  assert.equal(received.length, 2);
  assert.match(received[0].content[0].text, /one/);
  assert.match(received[1].content[0].text, /two/);
  assert.equal(mailbox.pendingFor("s2").length, 0);
});

test("delivery failure warns and leaves the record pending", async () => {
  const { agents, mailbox, registry, courier, warns } = setup();
  registry.bind("reviewer", "s2");
  await courier.send(fakeAgent("s1"), { toRole: "reviewer", message: "boom" });
  agents.set("s2", fakeAgent("s2", () => { throw new Error("followup boom"); }));
  await courier.flush("s2");
  assert.equal(warns.length, 1);
  assert.match(warns[0], /followup boom/);
  assert.equal(mailbox.pendingFor("s2").length, 1);
});

test("an agent disappearing between checks returns queued", async () => {
  const { agents, mailbox, registry, courier } = setup();
  registry.bind("reviewer", "s2");
  let calls = 0;
  agents.get = (id) => (calls++ === 0 ? fakeAgent("s2") : undefined);
  const result = await courier.send(fakeAgent("s1"), { toRole: "reviewer", message: "race" });
  assert.equal(result.queued, true);
  assert.equal(mailbox.pendingFor("s2").length, 1);
});

test("send to own session id rejects", async () => {
  const { agents, courier } = setup();
  agents.set("s1", fakeAgent("s1"));
  await assert.rejects(
    courier.send(fakeAgent("s1"), { toSessionId: "s1", message: "x" }),
    /cannot send to yourself/
  );
});

test("send to own registered role rejects", async () => {
  const { agents, registry, courier } = setup();
  registry.bind("coder", "s1");
  agents.set("s1", fakeAgent("s1"));
  await assert.rejects(
    courier.send(fakeAgent("s1"), { toRole: "coder", message: "x" }),
    /cannot send to yourself/
  );
});

test("register binds the calling session and status reflects it", () => {
  const { agents, courier } = setup();
  agents.set("s1", fakeAgent("s1"));
  courier.register(fakeAgent("s1"), "coder");
  assert.deepEqual(courier.status(), [{ role: "coder", sessionId: "s1", online: true, queued: 0 }]);
});
