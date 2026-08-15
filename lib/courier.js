import { Service } from "@deepseek-ai/cordis";
import { createUserMessage } from "@deepseek-ai/dsh-llm";

export class Courier extends Service {
  constructor(ctx, { mailbox, registry, warn }) {
    super(ctx, "courier");
    this.mailbox = mailbox;
    this.registry = registry;
    this.warn = warn ?? ((message) => this.ctx.logger.warn(message));
    this.tails = new Map();
    ctx.on("session/created", (session) => {
      void this.flush(session.id).catch((error) => this.warn("courier flush failed: " + error.message));
    });
  }

  async send(sender, { toRole, toSessionId, message }) {
    if (typeof message !== "string" || message === "") {
      throw new Error("courier: message must be a non-empty string");
    }
    const target = this.resolveTarget(toRole, toSessionId);
    if (target.sessionId === sender.id) {
      throw new Error("courier: cannot send to yourself (" + target.sessionId + ")");
    }
    const record = this.mailbox.enqueue({
      from: { role: this.registry.roleOf(sender.id) ?? null, sessionId: sender.id },
      to: { role: toRole ?? null, sessionId: target.sessionId },
      content: message,
    });
    if (this.ctx.agents.get(target.sessionId) === undefined) {
      return { queued: true, delivered: false, messageId: record.id };
    }
    return this.runFor(target.sessionId, () => {
      const agent = this.ctx.agents.get(target.sessionId);
      if (agent === undefined) return { queued: true, delivered: false, messageId: record.id };
      try {
        return this.deliver(agent, record);
      } catch (error) {
        this.warn("courier delivery failed for " + record.id + ": " + error.message);
        return { queued: true, delivered: false, messageId: record.id };
      }
    });
  }

  resolveTarget(toRole, toSessionId) {
    if ((toRole === undefined) === (toSessionId === undefined)) {
      throw new Error("courier: exactly one of to_role or to_session_id is required");
    }
    if (toRole !== undefined) {
      if (typeof toRole !== "string" || toRole === "") throw new Error("courier: to_role must be a non-empty string");
      const sessionId = this.registry.sessionIdOf(toRole);
      if (sessionId === undefined) {
        const known = this.registry.list().map((entry) => entry.role).join(", ");
        throw new Error("courier: role " + JSON.stringify(toRole) + " is not registered (registered: " + (known || "none") + ")");
      }
      return { role: toRole, sessionId };
    }
    if (typeof toSessionId !== "string" || toSessionId === "") throw new Error("courier: to_session_id must be a non-empty string");
    return { role: null, sessionId: toSessionId };
  }

  deliver(agent, record) {
    const header = record.from.role !== null
      ? "[courier " + record.from.role + " " + record.from.sessionId + "]"
      : "[courier " + record.from.sessionId + "]";
    const message = createUserMessage({
      content: [{ type: "text", text: header + "\n" + record.content }],
      source: {
        kind: "courier",
        form: "relay",
        senderRole: record.from.role,
        senderSessionId: record.from.sessionId,
      },
    });
    agent.followup(message);
    this.mailbox.markDelivered(record.id);
    return { queued: false, delivered: true, messageId: record.id };
  }

  flush(sessionId) {
    const operations = this.mailbox.pendingFor(sessionId).map((record) => {
      return this.runFor(sessionId, () => {
        const agent = this.ctx.agents.get(sessionId);
        if (agent === undefined) return;
        try {
          this.deliver(agent, record);
        } catch (error) {
          this.warn("courier delivery failed for " + record.id + ": " + error.message);
        }
      });
    });
    return Promise.all(operations);
  }

  runFor(key, operation) {
    const tail = (this.tails.get(key) ?? Promise.resolve()).then(operation, operation);
    const settled = tail.then(() => undefined, () => undefined);
    this.tails.set(key, settled);
    settled.then(() => { if (this.tails.get(key) === settled) this.tails.delete(key); });
    return tail;
  }

  register(agent, role) {
    return this.registry.bind(role, agent.id);
  }

  status() {
    return this.registry.list().map(({ role, sessionId }) => ({
      role,
      sessionId,
      online: this.ctx.agents.get(sessionId) !== undefined,
      queued: this.mailbox.pendingFor(sessionId).length,
    }));
  }
}
