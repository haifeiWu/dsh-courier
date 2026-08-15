import { test } from "node:test";
import assert from "node:assert/strict";
import { Context } from "@deepseek-ai/cordis";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import * as plugin from "../lib/index.js";

function fakeAgent(id, followup) {
  return { id, followup: followup ?? (() => {}) };
}

async function setup() {
  const dir = mkdtempSync(join(tmpdir(), "courier-plugin-"));
  const ctx = new Context();
  const agents = new Map();
  const registeredTools = [];
  const sections = [];
  ctx.provide("tools", { register: (def) => { registeredTools.push(def); return () => {}; } });
  ctx.provide("agents", { get: (id) => agents.get(id), list: () => [...agents.values()] });
  ctx.provide("sessions", {});
  ctx.provide("systemPrompt", { section: (s) => sections.push(s) });
  ctx.plugin(plugin, {
    mailboxPath: join(dir, "mailbox.jsonl"),
    registryPath: join(dir, "roles.json"),
    roles: { reviewer: "s2" },
  });
  await new Promise((resolve) => setTimeout(resolve, 10));
  return { ctx, agents, registeredTools, sections, dir };
}

test("apply wires the courier service, tools and prompt sections", async () => {
  const { ctx, registeredTools, sections } = await setup();
  assert.equal(typeof ctx.courier.send, "function");
  assert.deepEqual(registeredTools.map((d) => d.name), ["courier_send", "courier_register", "courier_list"]);
  assert.equal(sections.length, 1);
  assert.equal(sections[0].name, "courier:role-protocol");
});

test("seed roles are loaded and visible via courier_list tool", async () => {
  const { registeredTools } = await setup();
  const result = await registeredTools[2].execute({}, { agent: fakeAgent("s1"), signal: new AbortController().signal });
  assert.deepEqual(result, { roles: [{ role: "reviewer", sessionId: "s2", online: false, queued: 0 }] });
});

test("courier_send queues while offline and flush delivers on session/created", async () => {
  const { ctx, agents, registeredTools } = await setup();
  const first = await registeredTools[0].execute(
    { to_role: "reviewer", message: "请评审" },
    { agent: fakeAgent("s1"), signal: new AbortController().signal },
  );
  assert.equal(first.queued, true);
  const received = [];
  agents.set("s2", fakeAgent("s2", (m) => received.push(m)));
  ctx.emit("session/created", { id: "s2" });
  await new Promise((resolve) => setTimeout(resolve, 20));
  assert.equal(received.length, 1);
  assert.match(received[0].content[0].text, /请评审/);
});

test("courier_register rejects invalid role names", async () => {
  const { registeredTools } = await setup();
  await assert.rejects(
    registeredTools[1].execute({ role: "Bad Role" }, { agent: fakeAgent("s1"), signal: new AbortController().signal }),
    /invalid role name/
  );
});
