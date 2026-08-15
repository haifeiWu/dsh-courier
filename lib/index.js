export const name = "dsh-courier";
export const inject = ["tools", "agents", "sessions", "systemPrompt"];

export function apply(ctx) {
  // 各模块接线在 Task 4/5/6/7 完成
  ctx.logger.info("dsh-courier loaded");
}
