/**
 * 飞书出站适配器
 */

import { sendMarkdownCardFeishu, sendMessageFeishu } from "./send.js";
import { getFeishuRuntime } from "./runtime.js";
import type { FeishuConfig } from "./types.js";

export interface OutboundConfig {
  channels?: {
    feishu?: FeishuConfig;
  };
}

export interface SendResult {
  channel: string;
  messageId: string;
  chatId?: string;
  conversationId?: string;
}

function parseTarget(to: string): { targetId: string; receiveIdType: "chat_id" | "open_id" } {
  if (to.startsWith("chat:")) {
    return { targetId: to.slice(5), receiveIdType: "chat_id" };
  }
  if (to.startsWith("user:")) {
    return { targetId: to.slice(5), receiveIdType: "open_id" };
  }
  return { targetId: to, receiveIdType: "chat_id" };
}

export const feishuOutbound = {
  deliveryMode: "direct" as const,
  textChunkLimit: 4000,
  chunkerMode: "markdown" as const,

  chunker: (text: string, limit: number): string[] => {
    try {
      const runtime = getFeishuRuntime();
      if (runtime.channel?.text?.chunkMarkdownText) {
        return runtime.channel.text.chunkMarkdownText(text, limit);
      }
    } catch {
      // runtime 未初始化，返回原文
    }
    return [text];
  },

  sendText: async (params: { cfg: OutboundConfig; to: string; text: string }): Promise<SendResult> => {
    const { cfg, to, text } = params;

    const feishuCfg = cfg.channels?.feishu;
    if (!feishuCfg) {
      throw new Error("Feishu channel not configured");
    }

    const { targetId, receiveIdType } = parseTarget(to);

    const result = feishuCfg.sendMarkdownAsCard
      ? await sendMarkdownCardFeishu({
          cfg: feishuCfg,
          to: targetId,
          text,
          receiveIdType,
        })
      : await sendMessageFeishu({
          cfg: feishuCfg,
          to: targetId,
          text,
          receiveIdType,
        });

    return {
      channel: "feishu",
      messageId: result.messageId,
      chatId: result.chatId,
      conversationId: result.chatId,
    };
  },
};
