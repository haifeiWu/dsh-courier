import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { RoleRegistry } from "../lib/registry.js";

function tempPath() {
  return join(mkdtempSync(join(tmpdir(), "registry-")), "roles.json");
}

test("seed roles resolve by role and by session", () => {
  const registry = new RoleRegistry(tempPath(), { reviewer: "s2" });
  assert.equal(registry.sessionIdOf("reviewer"), "s2");
  assert.equal(registry.roleOf("s2"), "reviewer");
  assert.equal(registry.sessionIdOf("coder"), undefined);
});

test("load merges file entries over seeds", () => {
  const path = tempPath();
  writeFileSync(path, JSON.stringify({ reviewer: "s9", coder: "s1" }), "utf8");
  const registry = new RoleRegistry(path, { reviewer: "s2" });
  registry.load();
  assert.equal(registry.sessionIdOf("reviewer"), "s9");
  assert.equal(registry.sessionIdOf("coder"), "s1");
  assert.equal(registry.roleOf("s2"), undefined);
});

test("load clears stale forward mapping when file rebinds a seeded session", () => {
  const path = tempPath();
  writeFileSync(path, JSON.stringify({ reviewer: "s1" }), "utf8");
  const registry = new RoleRegistry(path, { coder: "s1" });
  registry.load();
  assert.equal(registry.sessionIdOf("coder"), undefined);
  assert.equal(registry.roleOf("s1"), "reviewer");
  assert.deepEqual(registry.list(), [{ role: "reviewer", sessionId: "s1" }]);
});

test("load handles a session rebinding while a role moves to a new session", () => {
  const path = tempPath();
  writeFileSync(path, JSON.stringify({ coder: "s1", reviewer: "s2" }), "utf8");
  const registry = new RoleRegistry(path, { reviewer: "s1" });
  registry.load();
  assert.equal(registry.sessionIdOf("coder"), "s1");
  assert.equal(registry.sessionIdOf("reviewer"), "s2");
  assert.equal(registry.roleOf("s1"), "coder");
  assert.equal(registry.roleOf("s2"), "reviewer");
});

test("bind writes the file and rebinds a session to a new role", () => {
  const path = tempPath();
  const first = new RoleRegistry(path);
  first.bind("coder", "s1");
  first.bind("reviewer", "s1");
  assert.equal(first.sessionIdOf("coder"), undefined);
  assert.equal(first.sessionIdOf("reviewer"), "s1");
  const second = new RoleRegistry(path);
  second.load();
  assert.deepEqual(second.list(), [{ role: "reviewer", sessionId: "s1" }]);
});

test("rebinding a role to a new session clears the old session's mapping", () => {
  const registry = new RoleRegistry(tempPath());
  registry.bind("coder", "s1");
  registry.bind("coder", "s2");
  assert.equal(registry.roleOf("s1"), undefined);
  assert.equal(registry.roleOf("s2"), "coder");
  assert.equal(registry.sessionIdOf("coder"), "s2");
});

test("old session rebinding to another role does not delete the active role", () => {
  const registry = new RoleRegistry(tempPath());
  registry.bind("coder", "s1");
  registry.bind("coder", "s2");
  registry.bind("reviewer", "s1");
  assert.equal(registry.sessionIdOf("coder"), "s2");
  assert.equal(registry.roleOf("s1"), "reviewer");
});

test("invalid role name throws", () => {
  const registry = new RoleRegistry(tempPath());
  assert.throws(() => registry.bind("Bad Role", "s1"), /invalid role name/);
});

test("corrupt registry file warns and keeps seeds", () => {
  const path = tempPath();
  writeFileSync(path, "{not json", "utf8");
  const warns = [];
  const registry = new RoleRegistry(path, { coder: "s1" }, (m) => warns.push(m));
  registry.load();
  assert.equal(warns.length, 1);
  assert.equal(registry.sessionIdOf("coder"), "s1");
});

test("list returns roles sorted by name", () => {
  const registry = new RoleRegistry(tempPath());
  registry.bind("reviewer", "s2");
  registry.bind("coder", "s1");
  assert.deepEqual(registry.list(), [
    { role: "coder", sessionId: "s1" },
    { role: "reviewer", sessionId: "s2" },
  ]);
});
