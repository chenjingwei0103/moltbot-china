/**
 * 飞书消息处理
 *
 * 实现消息解析、策略检查和 Agent 分发
 */

import type { FeishuMessageEvent, FeishuMessageContext } from "./types.js";
import type { FeishuConfig } from "./config.js";
import { getFeishuRuntime, isFeishuRuntimeInitialized } from "./runtime.js";
import { sendMarkdownCardFeishu, sendMessageFeishu } from "./send.js";
import { createLogger, type Logger } from "./logger.js";
import { checkDmPolicy, checkGroupPolicy } from "@openclaw-china/shared";

/**
 * 解析飞书消息事件为标准化上下文
 */
export function parseFeishuMessageEvent(event: FeishuMessageEvent): FeishuMessageContext {
  const message = event.message ?? {};
  const sender = event.sender?.sender_id ?? {};

  const chatType = message.chat_type === "group" ? "group" : "direct";
  const senderId = sender.open_id ?? sender.user_id ?? sender.union_id ?? "";
  const messageId = message.message_id ?? `${message.chat_id ?? ""}_${Date.now()}`;
  const contentType = message.message_type ?? "";

  let content = "";
  if (contentType === "text" && message.content) {
    try {
      const parsed = JSON.parse(message.content) as { text?: string };
      content = (parsed.text ?? "").trim();
    } catch {
      content = message.content.trim();
    }
  }

  const mentions = message.mentions ?? [];
  const mentionedBot = mentions.length > 0;

  return {
    chatId: message.chat_id ?? "",
    messageId,
    senderId,
    chatType,
    content,
    contentType,
    mentionedBot,
  };
}

/**
 * 入站消息上下文
 */
export interface InboundContext {
  Body: string;
  RawBody: string;
  CommandBody: string;
  From: string;
  To: string;
  SessionKey: string;
  AccountId: string;
  ChatType: "direct" | "group";
  GroupSubject?: string;
  SenderName?: string;
  SenderId: string;
  Provider: "feishu";
  MessageSid: string;
  Timestamp: number;
  WasMentioned: boolean;
  CommandAuthorized: boolean;
  OriginatingChannel: "feishu";
  OriginatingTo: string;
}

/**
 * 构建入站消息上下文
 */
export function buildInboundContext(
  ctx: FeishuMessageContext,
  sessionKey: string,
  accountId: string
): InboundContext {
  const isGroup = ctx.chatType === "group";

  const from = isGroup
    ? `feishu:group:${ctx.chatId}`
    : `feishu:${ctx.senderId}`;
  const to = isGroup
    ? `chat:${ctx.chatId}`
    : `user:${ctx.senderId}`;

  return {
    Body: ctx.content,
    RawBody: ctx.content,
    CommandBody: ctx.content,
    From: from,
    To: to,
    SessionKey: sessionKey,
    AccountId: accountId,
    ChatType: ctx.chatType,
    GroupSubject: isGroup ? ctx.chatId : undefined,
    SenderName: ctx.senderId,
    SenderId: ctx.senderId,
    Provider: "feishu",
    MessageSid: ctx.messageId,
    Timestamp: Date.now(),
    WasMentioned: ctx.mentionedBot,
    CommandAuthorized: true,
    OriginatingChannel: "feishu",
    OriginatingTo: to,
  };
}

/**
 * 处理飞书入站消息
 */
export async function handleFeishuMessage(params: {
  cfg: unknown;
  event: FeishuMessageEvent;
  accountId?: string;
  log?: (msg: string) => void;
  error?: (msg: string) => void;
}): Promise<void> {
  const { cfg, event, accountId = "default" } = params;

  const logger: Logger = createLogger("feishu", {
    log: params.log,
    error: params.error,
  });

  const ctx = parseFeishuMessageEvent(event);
  const isGroup = ctx.chatType === "group";

  if (!ctx.content || ctx.contentType !== "text") {
    logger.debug("unsupported message type or empty content, skipping");
    return;
  }

  const feishuCfg = (cfg as Record<string, unknown>)?.channels as Record<string, unknown> | undefined;
  const channelCfg = feishuCfg?.feishu as FeishuConfig | undefined;

  if (isGroup) {
    const groupPolicy = channelCfg?.groupPolicy ?? "open";
    const groupAllowFrom = channelCfg?.groupAllowFrom ?? [];
    const requireMention = channelCfg?.requireMention ?? true;

    const policyResult = checkGroupPolicy({
      groupPolicy,
      conversationId: ctx.chatId,
      groupAllowFrom,
      requireMention,
      mentionedBot: ctx.mentionedBot,
    });

    if (!policyResult.allowed) {
      logger.debug(`policy rejected: ${policyResult.reason}`);
      return;
    }
  } else {
    const dmPolicy = channelCfg?.dmPolicy ?? "open";
    const allowFrom = channelCfg?.allowFrom ?? [];

    const policyResult = checkDmPolicy({
      dmPolicy,
      senderId: ctx.senderId,
      allowFrom,
    });

    if (!policyResult.allowed) {
      logger.debug(`policy rejected: ${policyResult.reason}`);
      return;
    }
  }

  if (!isFeishuRuntimeInitialized()) {
    logger.warn("runtime not initialized, skipping dispatch");
    return;
  }

  try {
    const core = getFeishuRuntime();

    if (!core.channel?.routing?.resolveAgentRoute) {
      logger.debug("core.channel.routing.resolveAgentRoute not available, skipping dispatch");
      return;
    }

    if (!core.channel?.reply?.dispatchReplyFromConfig) {
      logger.debug("core.channel.reply.dispatchReplyFromConfig not available, skipping dispatch");
      return;
    }

    if (!core.channel?.reply?.createReplyDispatcher && !core.channel?.reply?.createReplyDispatcherWithTyping) {
      logger.debug("core.channel.reply dispatcher factory not available, skipping dispatch");
      return;
    }

    const route = core.channel.routing.resolveAgentRoute({
      cfg,
      channel: "feishu",
      peer: {
        kind: isGroup ? "group" : "dm",
        id: isGroup ? ctx.chatId : ctx.senderId,
      },
    });

    const inboundCtx = buildInboundContext(ctx, route.sessionKey, route.accountId);

    const finalCtx = core.channel.reply.finalizeInboundContext
      ? core.channel.reply.finalizeInboundContext(inboundCtx)
      : inboundCtx;

    if (!channelCfg) {
      logger.warn("channel config missing, skipping dispatch");
      return;
    }

    const textApi = core.channel?.text;

    const textChunkLimit =
      textApi?.resolveTextChunkLimit?.({
        cfg,
        channel: "feishu",
        defaultLimit: channelCfg.textChunkLimit ?? 4000,
      }) ?? (channelCfg.textChunkLimit ?? 4000);
    const chunkMode = textApi?.resolveChunkMode?.(cfg, "feishu");

    const deliver = async (payload: { text?: string }) => {
      const rawText = payload.text ?? "";
      if (!rawText.trim()) return;

      const chunks =
        textApi?.chunkTextWithMode && typeof textChunkLimit === "number" && textChunkLimit > 0
          ? textApi.chunkTextWithMode(rawText, textChunkLimit, chunkMode)
          : [rawText];

      for (const chunk of chunks) {
        if (channelCfg.sendMarkdownAsCard) {
          await sendMarkdownCardFeishu({
            cfg: channelCfg,
            to: ctx.chatId,
            text: chunk,
            receiveIdType: "chat_id",
          });
        } else {
          await sendMessageFeishu({
            cfg: channelCfg,
            to: ctx.chatId,
            text: chunk,
            receiveIdType: "chat_id",
          });
        }
      }
    };

    const humanDelay = core.channel.reply.resolveHumanDelayConfig
      ? core.channel.reply.resolveHumanDelayConfig(cfg, route.agentId)
      : undefined;

    const dispatcherResult = core.channel.reply.createReplyDispatcherWithTyping
      ? core.channel.reply.createReplyDispatcherWithTyping({
          deliver: async (payload: unknown) => {
            await deliver(payload as { text?: string });
          },
          humanDelay,
          onError: (err: unknown, info: { kind: string }) => {
            logger.error(`${info.kind} reply failed: ${String(err)}`);
          },
        })
      : {
          dispatcher: core.channel.reply.createReplyDispatcher?.({
            deliver: async (payload: unknown) => {
              await deliver(payload as { text?: string });
            },
            humanDelay,
            onError: (err: unknown, info: { kind: string }) => {
              logger.error(`${info.kind} reply failed: ${String(err)}`);
            },
          }),
          replyOptions: {},
          markDispatchIdle: () => undefined,
        };

    if (!dispatcherResult.dispatcher) {
      logger.debug("dispatcher not available, skipping dispatch");
      return;
    }

    logger.debug(`dispatching to agent (session=${route.sessionKey})`);

    const { queuedFinal, counts } = await core.channel.reply.dispatchReplyFromConfig({
      ctx: finalCtx,
      cfg,
      dispatcher: dispatcherResult.dispatcher,
      replyOptions: dispatcherResult.replyOptions,
    });

    dispatcherResult.markDispatchIdle?.();

    logger.debug(`dispatch complete (queuedFinal=${queuedFinal}, replies=${counts.final})`);
  } catch (err) {
    logger.error(`failed to dispatch message: ${String(err)}`);
  }
}
