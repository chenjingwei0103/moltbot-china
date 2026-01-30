# OpenClaw China

![license](https://img.shields.io/badge/license-MIT-green.svg) ![status](https://img.shields.io/badge/status-active-success.svg)

面向中国 IM 平台的 OpenClaw 扩展插件集合

⭐ **如果这个项目对你有帮助，请给个 Star 支持一下~** ⭐

[快速开始](#快速开始) · [演示](#演示) · [配置选项](#配置选项) · [开发](#开发)

| 平台 | 状态 |
|------|:----:|
| 钉钉 | ✅ 可用 |
| 飞书 | ✅ 可用 |
| 企业微信 | 🚧 开发中 |
| QQ 机器人 | 🚧 开发中 |

## 快速开始

### 1) 安装

**安装统一包（包含所有渠道）**

```bash
clawdbot plugins install @openclaw-china/channels
```

**或者：安装单个渠道（不要和统一包同时安装）**

```bash
clawdbot plugins install @openclaw-china/dingtalk
```

```bash
clawdbot plugins install @openclaw-china/feishu
```

### 2) 配置渠道

#### 钉钉

> 📖 **[钉钉企业注册指南](doc/guides/dingtalk/configuration.md)** — 无需材料，5 分钟内完成配置
```bash
clawdbot config set channels.dingtalk '{
  "enabled": true,
  "clientId": "dingxxxxxx",
  "clientSecret": "your-app-secret"
}' --json
```

**可选高级配置**

如果你需要更细粒度控制（例如私聊/群聊策略或白名单），可以在 `~/.clawdbot/clawdbot.json` 中按需添加：

```json5
{
  "channels": {
    "dingtalk": {
      "dmPolicy": "open",          // open | allowlist
      "groupPolicy": "open",       // open | allowlist | disabled
      "requireMention": true,
      "allowFrom": [],
      "groupAllowFrom": []
    }
  }
}
```

#### 飞书

> 飞书应用需开启机器人能力，并使用「长连接接收消息」模式

Clawdbot:

```bash
clawdbot config set channels.feishu '{
  "enabled": true,
  "appId": "cli_xxxxxx",
  "appSecret": "your-app-secret"
}' --json
```

### 3) 重启 Gateway

```bash
clawdbot gateway restart
```

## 演示

以下为钉钉渠道效果示例：

![钉钉机器人演示](doc/images/dingtalk-demo_2.gif)

![钉钉机器人演示](doc/images/dingtalk-demo_3.png)

## 配置选项

> 通用字段适用于所有渠道；渠道专用字段仅在对应渠道生效。

### 通用字段

| 选项 | 说明 |
|------|------|
| `enabled` | 是否启用 |
| `dmPolicy` | 私聊策略：`open`（任何人）/ `allowlist`（白名单） |
| `groupPolicy` | 群聊策略：`open`（任何群）/ `allowlist`（白名单）/ `disabled`（禁用） |
| `requireMention` | 群聊中是否需要 @机器人 |
| `allowFrom` | 私聊白名单用户 ID |
| `groupAllowFrom` | 群聊白名单群 ID |


### 会话配置（可选）

`session.dmScope` 控制不同用户的会话隔离方式：

| 值 | 说明 |
|----|------|
| `main` | 所有用户共享同一会话（不推荐） |
| `per-peer` | **推荐**，按用户 ID 隔离 |
| `per-channel-peer` | 按渠道 + 用户隔离 |

## 开发

适合需要二次开发或调试的场景：

```bash
# 克隆仓库
git clone https://github.com/BytePioneer-AI/moltbot-china.git
cd moltbot-china

# 安装依赖并构建
pnpm install
pnpm build

# 以链接模式安装（修改代码后实时生效，二选一）
clawdbot plugins install -l ./packages/channels

# 单渠道开发时：
# clawdbot plugins install -l ./extensions/dingtalk
```

**示例配置（开发环境）**

```json
{
  "plugins": {
    "load": {
      "paths": ["/path/to/OpenClaw-china/packages/channels"]
    },
    "entries": {
      "channels": { "enabled": true }
    }
  },
  "channels": {
    "dingtalk": {
      "enabled": true,
      "clientId": "dingxxxxxx",
      "clientSecret": "your-app-secret"
    },
    "feishu": {
      "enabled": true,
      "appId": "cli_xxxxxx",
      "appSecret": "your-app-secret"
    }
  }
}
```

## License

MIT
