import { test } from "node:test";
import assert from "node:assert/strict";
import { registerCourierTools } from "../lib/tools.js";

function setup() {
  const registered = [];
  const calls = [];
  const courier = {
    send: async (...args) => { calls.push(["send", ...args]); return { delivered: true, queued: false, messageId: "m1" }; },
    register: (...args) => { calls.push(["register", ...args]); return { role: args[1], sessionId: args[0].id }; },
    status: () => [{ role: "coder", sessionId: "s1", online: true, queued: 0 }],
  };
  const ctx = { tools: { register: (def) => { registered.push(def); return () => {}; } } };
  const disposers = registerCourierTools(ctx, courier);
  return { registered, calls, courier, disposers };
}

function exec() {
  return { agent: { id: "s1" }, signal: new AbortController().signal };
}

test("registers courier_send, courier_register and courier_list", () => {
  const { registered } = setup();
  assert.deepEqual(registered.map((d) => d.name), ["courier_send", "courier_register", "courier_list"]);
});

test("courier_send forwards arguments and returns the courier result", async () => {
  const { registered, calls } = setup();
  const result = await registered[0].execute({ to_role: "reviewer", message: "hi" }, exec());
  assert.deepEqual(result, { delivered: true, queued: false, messageId: "m1" });
  assert.equal(calls[0][0], "send");
  assert.equal(calls[0][1].id, "s1");
  assert.deepEqual(calls[0][2], { toRole: "reviewer", toSessionId: undefined, message: "hi" });
});

test("courier_send without a calling agent rejects", async () => {
  const { registered } = setup();
  await assert.rejects(
    registered[0].execute({ to_role: "reviewer", message: "hi" }, { agent: undefined, signal: new AbortController().signal }),
    /requires a calling agent/
  );
});

test("courier_register binds the calling session to the role", async () => {
  const { registered, calls } = setup();
  const result = await registered[1].execute({ role: "coder" }, exec());
  assert.deepEqual(result, { role: "coder", sessionId: "s1" });
  assert.equal(calls[0][0], "register");
});

test("courier_list returns role status rows", async () => {
  const { registered } = setup();
  const result = await registered[2].execute({}, exec());
  assert.deepEqual(result, { roles: [{ role: "coder", sessionId: "s1", online: true, queued: 0 }] });
});

test("disposers are returned for every registered tool", () => {
  const { disposers } = setup();
  assert.equal(disposers.length, 3);
  for (const dispose of disposers) assert.equal(typeof dispose, "function");
});
