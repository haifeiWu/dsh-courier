import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

const ROLE_RE = /^[a-z][a-z0-9-]{0,31}$/;

export class RoleRegistry {
  constructor(path, seed = {}, warn = () => {}) {
    this.path = path;
    this.warn = warn;
    this.byRole = new Map();
    this.bySession = new Map();
    for (const [role, sessionId] of Object.entries(seed)) {
      if (typeof sessionId === "string" && sessionId !== "") {
        this.byRole.set(role, sessionId);
        this.bySession.set(sessionId, role);
      }
    }
  }

  load() {
    if (!existsSync(this.path)) return;
    let parsed;
    try {
      parsed = JSON.parse(readFileSync(this.path, "utf8"));
    } catch (error) {
      this.warn("courier registry unreadable: " + error.message);
      return;
    }
    if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
      this.warn("courier registry: invalid shape, ignored");
      return;
    }
    for (const [role, sessionId] of Object.entries(parsed)) {
      if (!ROLE_RE.test(role) || typeof sessionId !== "string" || sessionId === "") {
        this.warn("courier registry: invalid entry " + role);
        continue;
      }
      const previous = this.byRole.get(role);
      if (previous !== undefined && previous !== sessionId) {
        this.bySession.delete(previous);
      }
      this.byRole.set(role, sessionId);
      this.bySession.set(sessionId, role);
    }
  }

  validateRole(role) {
    if (typeof role !== "string" || !ROLE_RE.test(role)) {
      throw new Error("courier: invalid role name " + JSON.stringify(role) + " (must match " + ROLE_RE.source + ")");
    }
  }

  bind(role, sessionId) {
    this.validateRole(role);
    const previous = this.bySession.get(sessionId);
    if (previous !== undefined) this.byRole.delete(previous);
    this.byRole.set(role, sessionId);
    this.bySession.set(sessionId, role);
    this.save();
    return { role, sessionId };
  }

  sessionIdOf(role) {
    return this.byRole.get(role);
  }

  roleOf(sessionId) {
    return this.bySession.get(sessionId);
  }

  list() {
    return [...this.byRole.entries()]
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
      .map(([role, sessionId]) => ({ role, sessionId }));
  }

  save() {
    const data = Object.fromEntries(
      [...this.byRole.entries()].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)),
    );
    try {
      mkdirSync(dirname(this.path), { recursive: true });
      writeFileSync(this.path, JSON.stringify(data, null, 2) + "\n", "utf8");
    } catch (error) {
      this.warn("courier registry write failed: " + error.message);
    }
  }
}
