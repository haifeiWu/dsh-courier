import { test } from "node:test";
import assert from "node:assert/strict";
import { ROLE_PROTOCOLS, roleProtocolSections } from "../lib/prompts.js";
import { RoleRegistry } from "../lib/registry.js";

function registryWith(seed) {
  return new RoleRegistry("/tmp/nonexistent-roles.json", seed);
}

test("section is named courier:role-protocol with an order", () => {
  const sections = roleProtocolSections(registryWith({}));
  assert.equal(sections[0].name, "courier:role-protocol");
  assert.equal(typeof sections[0].order, "number");
});

test("text returns empty for contexts without an agent", () => {
  const sections = roleProtocolSections(registryWith({ coder: "s1" }));
  assert.equal(sections[0].text({}), "");
});

test("text returns the coder protocol for a registered coder agent", () => {
  const sections = roleProtocolSections(registryWith({ coder: "s1" }));
  const text = sections[0].text({ agent: { id: "s1" } });
  assert.match(text, /coder/);
  assert.match(text, /APPROVED/);
});

test("text returns empty for an unregistered agent", () => {
  const sections = roleProtocolSections(registryWith({ coder: "s1" }));
  assert.equal(sections[0].text({ agent: { id: "s9" } }), "");
});

test("custom prompts override built-ins", () => {
  const sections = roleProtocolSections(registryWith({ coder: "s1" }), { coder: "自定义协议" });
  assert.equal(sections[0].text({ agent: { id: "s1" } }), "自定义协议");
});

test("built-in protocols cover coder and reviewer", () => {
  assert.match(ROLE_PROTOCOLS.coder, /coder/);
  assert.match(ROLE_PROTOCOLS.reviewer, /reviewer/);
});
