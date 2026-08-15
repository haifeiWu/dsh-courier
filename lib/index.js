import z from "@deepseek-ai/schemastery";
import { homedir } from "node:os";
import { join } from "node:path";
import { Mailbox } from "./mailbox.js";
import { RoleRegistry } from "./registry.js";
import { Courier } from "./courier.js";
import { registerCourierTools } from "./tools.js";
import { roleProtocolSections, ROLE_PROTOCOLS } from "./prompts.js";

export const name = "dsh-courier";
export const inject = ["tools", "agents", "sessions", "systemPrompt"];

export const Config = z.object({
  mailboxPath: z.string().default(""),
  registryPath: z.string().default(""),
  roles: z.dict(z.string()).default({}),
  rolePrompts: z.dict(z.string()).default({}),
});

export function apply(ctx, config = {}) {
  const home = join(homedir(), ".dsh", "courier");
  const mailboxPath = config.mailboxPath || join(home, "mailbox.jsonl");
  const registryPath = config.registryPath || join(home, "roles.json");

  const registry = new RoleRegistry(registryPath, config.roles ?? {}, (message) => ctx.logger.warn(message));
  registry.load();

  const mailbox = new Mailbox(mailboxPath, (message) => ctx.logger.warn(message));
  mailbox.load();

  const courier = new Courier(ctx, { mailbox, registry, warn: (message) => ctx.logger.warn(message) });

  const disposers = registerCourierTools(ctx, courier);

  for (const section of roleProtocolSections(registry, { ...ROLE_PROTOCOLS, ...(config.rolePrompts ?? {}) })) {
    ctx.systemPrompt.section(section);
  }

  for (const entry of registry.list()) void courier.flush(entry.sessionId);

  ctx.effect(function* () {
    yield () => { for (const dispose of disposers) dispose(); };
  });
}
