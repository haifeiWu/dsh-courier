import { appendFileSync, existsSync, mkdirSync, readFileSync } from "node:fs";
import { dirname } from "node:path";
import { randomUUID } from "node:crypto";

function isRecord(entry) {
  return typeof entry === "object" && entry !== null &&
    typeof entry.id === "string" &&
    typeof entry.from === "object" && entry.from !== null && typeof entry.from.sessionId === "string" &&
    typeof entry.to === "object" && entry.to !== null && typeof entry.to.sessionId === "string" &&
    typeof entry.content === "string" &&
    entry.state === "pending";
}

export class Mailbox {
  constructor(path, warn = () => {}) {
    this.path = path;
    this.warn = warn;
    this.records = new Map();
    this.pendingBy = new Map();
  }

  load() {
    if (!existsSync(this.path)) return;
    let raw;
    try {
      raw = readFileSync(this.path, "utf8");
    } catch (error) {
      this.warn("courier mailbox unreadable: " + error.message);
      return;
    }
    for (const line of raw.split("\n")) {
      const trimmed = line.trim();
      if (trimmed === "") continue;
      let entry;
      try {
        entry = JSON.parse(trimmed);
      } catch {
        this.warn("courier mailbox skipped corrupt line");
        continue;
      }
      if (entry !== null && typeof entry === "object" && entry.state === "delivered" && typeof entry.id === "string") {
        const existing = this.records.get(entry.id);
        if (existing !== undefined) {
          existing.deliveredAt = entry.deliveredAt;
          this.applyDelivered(existing);
        }
      } else if (isRecord(entry)) {
        this.records.set(entry.id, entry);
        if (entry.state === "pending") this.pushPending(entry);
      } else {
        this.warn("courier mailbox skipped invalid record");
      }
    }
  }

  enqueue(input) {
    const record = {
      id: input.id ?? randomUUID(),
      from: input.from,
      to: input.to,
      content: input.content,
      createdAt: input.createdAt ?? Date.now(),
      deliveredAt: null,
      state: "pending",
    };
    this.records.set(record.id, record);
    this.pushPending(record);
    this.appendLine(record);
    return record;
  }

  pushPending(record) {
    const key = record.to.sessionId;
    let list = this.pendingBy.get(key);
    if (list === undefined) this.pendingBy.set(key, (list = []));
    if (!list.some((r) => r.id === record.id)) list.push(record);
  }

  pendingFor(sessionId) {
    return [...(this.pendingBy.get(sessionId) ?? [])];
  }

  markDelivered(id, deliveredAt) {
    const record = this.records.get(id);
    if (record === undefined) throw new Error("courier mailbox: unknown message " + id);
    if (record.state !== "pending") return;
    this.applyDelivered(record);
    this.appendLine({ id, state: "delivered", deliveredAt: deliveredAt ?? Date.now() });
  }

  applyDelivered(record) {
    record.state = "delivered";
    const key = record.to.sessionId;
    const list = this.pendingBy.get(key);
    if (list !== undefined) this.pendingBy.set(key, list.filter((r) => r.id !== record.id));
  }

  appendLine(entry) {
    try {
      mkdirSync(dirname(this.path), { recursive: true });
      appendFileSync(this.path, JSON.stringify(entry) + "\n", "utf8");
    } catch (error) {
      this.warn("courier mailbox write failed: " + error.message);
    }
  }
}
