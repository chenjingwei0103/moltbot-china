/**
 * 飞书发送消息
 */

import type { FeishuConfig } from "./config.js";
import type { FeishuSendResult } from "./types.js";
import { createFeishuClientFromConfig } from "./client.js";

export interface SendMessageParams {
  cfg: FeishuConfig;
  to: string;
  text: string;
  receiveIdType?: "chat_id" | "open_id";
}

export async function sendMessageFeishu(params: SendMessageParams): Promise<FeishuSendResult> {
  const { cfg, to, text, receiveIdType = "chat_id" } = params;

  const client = createFeishuClientFromConfig(cfg);

  try {
    const result = await client.im.v1.message.create({
      params: {
        receive_id_type: receiveIdType,
      },
      data: {
        receive_id: to,
        msg_type: "text",
        content: JSON.stringify({ text }),
      },
    });

    const messageId = (result as { data?: { message_id?: string } })?.data?.message_id ?? "";

    return {
      messageId,
      chatId: to,
    };
  } catch (err) {
    throw new Error(`Feishu send message failed: ${String(err)}`);
  }
}

export interface SendCardParams {
  cfg: FeishuConfig;
  to: string;
  card: Record<string, unknown>;
  receiveIdType?: "chat_id" | "open_id";
}

export async function sendCardFeishu(params: SendCardParams): Promise<FeishuSendResult> {
  const { cfg, to, card, receiveIdType = "chat_id" } = params;
  const client = createFeishuClientFromConfig(cfg);

  try {
    const result = await client.im.v1.message.create({
      params: {
        receive_id_type: receiveIdType,
      },
      data: {
        receive_id: to,
        msg_type: "interactive",
        content: JSON.stringify(card),
      },
    });

    const messageId = (result as { data?: { message_id?: string } })?.data?.message_id ?? "";

    return {
      messageId,
      chatId: to,
    };
  } catch (err) {
    throw new Error(`Feishu send card failed: ${String(err)}`);
  }
}

export function buildMarkdownCard(text: string): Record<string, unknown> {
  return {
    config: {
      wide_screen_mode: true,
    },
    elements: [
      {
        tag: "markdown",
        content: text,
      },
    ],
  };
}

export async function sendMarkdownCardFeishu(params: SendMessageParams): Promise<FeishuSendResult> {
  const { cfg, to, text, receiveIdType = "chat_id" } = params;
  const card = buildMarkdownCard(text);
  return sendCardFeishu({ cfg, to, card, receiveIdType });
}
