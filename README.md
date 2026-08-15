# dsh-courier

**dsh-courier** is a [DSH](https://github.com/deepseek-ai/deepseek-harness) plugin for **cross-session messaging**: reliable message delivery and role addressing between multiple sessions in the same host process, powering the "coding ↔ review" workflow loop.

- `courier_send` — wakes an online target session immediately (`agent.followup`); offline targets get persistent mailbox delivery (default `~/.dsh/courier/mailbox.jsonl`), auto-delivered on session resume
- `courier_register` / `courier_list` — role ↔ session mapping persisted in `~/.dsh/courier/roles.json` (or statically seeded via config)
- Review ledger at `.pi/review/ledger.md`: issues tracked as R1..Rn with `open → fixed → verified` states (reopened if re-review fails)

---

以下为中文文档 / Chinese documentation below:


DSH 跨会话通信插件：为同一宿主进程内的多个会话提供可靠消息投递与角色寻址，
支撑"编码 ↔ 评审"循环工作流。

## 安装

1. 安装进 web profile：`cd ~/.dsh/profiles/web && pnpm add file:/Users/chenzhiyun/work/opensource/dsh-courier`
2. 在 `~/.dsh/profiles/web/package.json` 的 `dsh.profile.bundles` 追加 `"dsh-courier"`
3. 重启 `dsh web`
4. 验证：`dsh web --dump-config | grep -A4 "id: courier"`

## 使用

1. 打开两个会话（同一仓库 cwd）
2. 会话 A 说：用 courier_register 把本会话注册为 coder
3. 会话 B 说：用 courier_register 把本会话注册为 reviewer
4. 会话 A 说：实现 X，完成后用 courier_send 通知 reviewer 评审
5. 双方按注入的角色协议循环，直到 reviewer 发出 APPROVED

## 协议要点

- courier_send：目标在线立即唤醒（agent.followup）；不在线进入持久化信箱（默认 ~/.dsh/courier/mailbox.jsonl），会话恢复时自动补投
- courier_register / courier_list：角色↔会话映射持久化在 ~/.dsh/courier/roles.json
- ledger：.pi/review/ledger.md，问题项 R1..Rn，状态 open → fixed → verified（复核不过 reopened）
- 角色可静态种子（配置 roles）或运行时注册（courier_register）
