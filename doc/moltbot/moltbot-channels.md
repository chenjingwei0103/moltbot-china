# Moltbot 支持的消息渠道

> 来源：moltbot/docs/channels/index.md

---

## 概述

Moltbot 可以连接到你已经使用的任何聊天应用。每个渠道通过 Gateway 连接。所有渠道都支持文本；媒体和表情回应因渠道而异。

---

## 已支持的渠道

| 渠道 | 说明 | 类型 |
|------|------|------|
| [WhatsApp](/channels/whatsapp) | 最流行；使用 Baileys，需要 QR 配对 | 内置 |
| [Telegram](/channels/telegram) | 通过 grammY 的 Bot API；支持群组 | 内置 |
| [Discord](/channels/discord) | Discord Bot API + Gateway；支持服务器、频道和私信 | 内置 |
| [Slack](/channels/slack) | Bolt SDK；工作区应用 | 内置 |
| [Google Chat](/channels/googlechat) | 通过 HTTP webhook 的 Google Chat API 应用 | 内置 |
| [Signal](/channels/signal) | signal-cli；注重隐私 | 内置 |
| [iMessage](/channels/imessage) | 仅 macOS；通过 imsg 的原生集成 | 内置 |
| [BlueBubbles](/channels/bluebubbles) | **推荐用于 iMessage**；使用 BlueBubbles macOS 服务器 REST API | 插件 |
| [Microsoft Teams](/channels/msteams) | Bot Framework；企业支持 | 插件 |
| [LINE](/channels/line) | LINE Messaging API bot | 插件 |
| [Matrix](/channels/matrix) | Matrix 协议 | 插件 |
| [Mattermost](/channels/mattermost) | Bot API + WebSocket | 插件 |
| [Nextcloud Talk](/channels/nextcloud-talk) | 通过 Nextcloud Talk 的自托管聊天 | 插件 |
| [Nostr](/channels/nostr) | 通过 NIP-04 的去中心化私信 | 插件 |
| [Tlon](/channels/tlon) | 基于 Urbit 的消息应用 | 插件 |
| [Twitch](/channels/twitch) | 通过 IRC 连接的 Twitch 聊天 | 插件 |
| [Zalo](/channels/zalo) | Zalo Bot API；越南流行的消息应用 | 插件 |
| [Zalo Personal](/channels/zalouser) | 通过 QR 登录的 Zalo 个人账户 | 插件 |
| [WebChat](/web/webchat) | 通过 WebSocket 的 Gateway WebChat UI | 内置 |

---

## 中国平台（moltbot-china）

| 渠道 | 状态 | 插件名称 |
|------|:----:|----------|
| 飞书 | 🚧 开发中 | `@openclaw-china/feishu` |
| 钉钉 | ✅ 已支持 | `@openclaw-china/dingtalk` |
| 企业微信 | ✅ 已支持 | `@openclaw-china/wecom` |
| QQ | 📋 计划中 | `@openclaw-china/qq` |

---

## 注意事项

- 渠道可以同时运行；配置多个渠道，Moltbot 会按聊天路由
- 最快的设置通常是 **Telegram**（简单的 bot token）
- WhatsApp 需要 QR 配对，并在磁盘上存储更多状态
- 群组行为因渠道而异
- 为安全起见，会强制执行 DM 配对和白名单
