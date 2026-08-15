import { defineTool } from "@deepseek-ai/dsh-tools";

export function registerCourierTools(ctx, courier) {
  const disposers = [];

  disposers.push(ctx.tools.register(defineTool({
    name: "courier_send",
    description: "向另一个 dsh 会话发送一条消息（按角色名或会话 id 寻址）。目标在线时立即唤醒对方开启新一轮；不在线时进入持久化信箱，对方会话恢复时自动补投。消息正文会带发送方标注。",
    parameters: {
      to_role: { type: "string", description: "目标角色名（如 coder/reviewer，与 to_session_id 二选一；未注册时报错并列出已注册角色）" },
      to_session_id: { type: "string", description: "目标会话 id（与 to_role 二选一；用 courier_list 查询）" },
      message: { type: "string", required: true, description: "消息正文" },
    },
    output: {
      schema: {
        type: "object",
        additionalProperties: false,
        properties: {
          delivered: { type: "boolean", required: true },
          queued: { type: "boolean", required: true },
          messageId: { type: "string", required: true },
        },
      },
      render: (_args, value) => [{
        type: "text",
        text: value.delivered ? "delivered as " + value.messageId : "queued (target offline) as " + value.messageId,
      }],
    },
    isConcurrencySafe: () => true,
    async execute(args, exec) {
      const sender = exec.agent;
      if (!sender) throw new Error("courier_send requires a calling agent");
      return courier.send(sender, {
        toRole: args.to_role,
        toSessionId: args.to_session_id,
        message: args.message,
      });
    },
  })));

  disposers.push(ctx.tools.register(defineTool({
    name: "courier_register",
    description: "把当前会话绑定到某个角色名（如 coder/reviewer）。之后其他会话可用 courier_send 按角色名找到本会话。绑定持久化到角色注册表。",
    parameters: {
      role: { type: "string", required: true, description: "角色名（小写字母开头，可含数字与连字符，最长 32 字符）" },
    },
    output: {
      schema: {
        type: "object",
        additionalProperties: false,
        properties: {
          role: { type: "string", required: true },
          sessionId: { type: "string", required: true },
        },
      },
      render: (_args, value) => [{ type: "text", text: "registered " + value.role + " as " + value.sessionId }],
    },
    isConcurrencySafe: () => true,
    async execute(args, exec) {
      const sender = exec.agent;
      if (!sender) throw new Error("courier_register requires a calling agent");
      return courier.register(sender, args.role);
    },
  })));

  disposers.push(ctx.tools.register(defineTool({
    name: "courier_list",
    description: "列出已注册的角色↔会话映射、在线状态与待投递队列深度。",
    parameters: {},
    output: {
      schema: {
        type: "object",
        additionalProperties: false,
        properties: {
          roles: {
            type: "array",
            required: true,
            items: {
              type: "object",
              additionalProperties: false,
              properties: {
                role: { type: "string", required: true },
                sessionId: { type: "string", required: true },
                online: { type: "boolean", required: true },
                queued: { type: "number", required: true },
              },
            },
          },
        },
      },
      render: (_args, value) => [{
        type: "text",
        text: value.roles.length === 0
          ? "no roles registered"
          : value.roles.map((r) => r.role + " -> " + r.sessionId + (r.online ? " (online)" : " (offline)") + (r.queued > 0 ? " queued:" + r.queued : "")).join("\n"),
      }],
    },
    isConcurrencySafe: () => true,
    async execute(_args, exec) {
      const sender = exec.agent;
      if (!sender) throw new Error("courier_list requires a calling agent");
      return { roles: courier.status() };
    },
  })));

  return disposers;
}
