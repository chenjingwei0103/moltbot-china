/**
 * 企业微信自建应用 API
 * 
 * 提供 Access Token 缓存和主动发送消息能力
 */
import type { ResolvedWecomAppAccount, WecomAppSendTarget, AccessTokenCacheEntry } from "./types.js";
import {
  resolveInboundMediaDir,
  resolveInboundMediaKeepDays,
} from "./config.js";
import { mkdir, writeFile, unlink, rename, readdir, stat } from "node:fs/promises";
import { basename, join, extname } from "node:path";
import { tmpdir } from "node:os";

/** 下载超时时间（毫秒） */
const DOWNLOAD_TIMEOUT = 120_000;

// ─────────────────────────────────────────────────────────────────────────────
// 入站媒体：产品级存储策略
// ─────────────────────────────────────────────────────────────────────────────

function formatDateDir(d = new Date()): string {
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

function isProbablyInWecomTmpDir(p: string): boolean {
  try {
    const base = join(tmpdir(), "wecom-app-media");
    const norm = (s: string) => s.replace(/\\/g, "/").toLowerCase();
    return norm(p).includes(norm(base));
  } catch {
    return false;
  }
}

export async function finalizeInboundMedia(account: ResolvedWecomAppAccount, filePath: string): Promise<string> {
  const p = String(filePath ?? "").trim();
  if (!p) return p;

  if (!isProbablyInWecomTmpDir(p)) return p;

  const baseDir = resolveInboundMediaDir(account.config ?? {});
  const datedDir = join(baseDir, formatDateDir());
  await mkdir(datedDir, { recursive: true });

  const name = basename(p);
  const dest = join(datedDir, name);

  try {
    await rename(p, dest);
    return dest;
  } catch {
    try {
      await unlink(p);
    } catch {
      // ignore
    }
    return p;
  }
}

export async function pruneInboundMediaDir(account: ResolvedWecomAppAccount): Promise<void> {
  const baseDir = resolveInboundMediaDir(account.config ?? {});
  const keepDays = resolveInboundMediaKeepDays(account.config ?? {});
  if (keepDays < 0) return;

  const now = Date.now();
  const cutoff = now - keepDays * 24 * 60 * 60 * 1000;

  let entries: string[];
  try {
    entries = await readdir(baseDir);
  } catch {
    return;
  }

  for (const entry of entries) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(entry)) continue;
    const dirPath = join(baseDir, entry);

    let st;
    try {
      st = await stat(dirPath);
    } catch {
      continue;
    }
    if (!st.isDirectory()) continue;

    const dirTime = st.mtimeMs || st.ctimeMs || 0;
    if (dirTime >= cutoff) continue;

    let files: string[] = [];
    try {
      files = await readdir(dirPath);
    } catch {
      continue;
    }

    for (const f of files) {
      const fp = join(dirPath, f);
      try {
        const fst = await stat(fp);
        if (fst.isFile() && (fst.mtimeMs || fst.ctimeMs || 0) < cutoff) {
          await unlink(fp);
        }
      } catch {
        // ignore
      }
    }
  }
}

export class FileSizeLimitError extends Error {
  public readonly actualSize: number;
  public readonly limitSize: number;
  public readonly msgType: string;

  constructor(actualSize: number, limitSize: number, msgType: string) {
    super(`File size ${actualSize} bytes exceeds limit ${limitSize} bytes for ${msgType}`);
    this.name = "FileSizeLimitError";
    this.actualSize = actualSize;
    this.limitSize = limitSize;
    this.msgType = msgType;
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, FileSizeLimitError);
    }
  }
}

export class TimeoutError extends Error {
  public readonly timeoutMs: number;

  constructor(timeoutMs: number) {
    super(`Download timed out after ${timeoutMs}ms`);
    this.name = "TimeoutError";
    this.timeoutMs = timeoutMs;
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, TimeoutError);
    }
  }
}

const accessTokenCache = new Map<string, AccessTokenCacheEntry>();
const ACCESS_TOKEN_TTL_MS = 7200 * 1000 - 5 * 60 * 1000;

export function stripMarkdown(text: string): string {
  let result = text;
  result = result.replace(/```(\w*)\n?([\s\S]*?)```/g, (_match, lang, code) => {
    const trimmedCode = code.trim();
    if (!trimmedCode) return "";
    const langLabel = lang ? `[${lang}]\n` : "";
    const indentedCode = trimmedCode.split("\n").map((line: string) => `    ${line}`).join("\n");
    return `\n${langLabel}${indentedCode}\n`;
  });
  result = result.replace(/^#{1,6}\s+(.+)$/gm, "【$1】");
  result = result.replace(/\*\*(.*?)\*\*/g, "$1").replace(/\*(.*?)\*/g, "$1").replace(/__(.*?)__/g, "$1").replace(/(?<![\w/])_(.+?)_(?![\w/])/g, "$1");
  result = result.replace(/^[-*]\s+/gm, "· ");
  result = result.replace(/^(\d+)\.\s+/gm, "$1. ");
  result = result.replace(/`([^`]+)`/g, "$1");
  result = result.replace(/~~(.*?)~~/g, "$1");
  result = result.replace(/\[([^\]]+)\]\(([^)]+)\)/g, "$1 ($2)");
  result = result.replace(/!\[([^\]]*)\]\([^)]+\)/g, "[图片: $1]");
  result = result.replace(/\|(.+)\|\n\|[-:| ]+\|\n((?:\|.+\|\n?)*)/g, (_match, header, body) => {
      const headerCells = header.split("|").map((c: string) => c.trim()).filter(Boolean);
      const rows = body.trim().split("\n").map((row: string) => row.split("|").map((c: string) => c.trim()).filter(Boolean));
      const colWidths = headerCells.map((h: string, i: number) => {
        const maxRowWidth = Math.max(...rows.map((r: string[]) => (r[i] || "").length));
        return Math.max(h.length, maxRowWidth);
      });
      const formattedHeader = headerCells.map((h: string, i: number) => h.padEnd(colWidths[i])).join("  ");
      const formattedRows = rows.map((row: string[]) => headerCells.map((_: string, i: number) => (row[i] || "").padEnd(colWidths[i])).join("  ")).join("\n");
      return `${formattedHeader}\n${formattedRows}\n`;
    });
  result = result.replace(/^>\s?/gm, "");
  result = result.replace(/^[-*_]{3,}$/gm, "────────────");
  result = result.replace(/\n{3,}/g, "\n\n");
  return result.trim();
}

export async function getAccessToken(account: ResolvedWecomAppAccount): Promise<string> {
  if (!account.corpId || !account.corpSecret) {
    throw new Error("corpId or corpSecret not configured");
  }
  const key = `${account.corpId}:${account.agentId ?? "default"}`;
  const cached = accessTokenCache.get(key);
  if (cached && Date.now() < cached.expiresAt) {
    return cached.token;
  }
  const url = `https://qyapi.weixin.qq.com/cgi-bin/gettoken?corpid=${encodeURIComponent(account.corpId)}&corpsecret=${encodeURIComponent(account.corpSecret)}`;
  const resp = await fetch(url);
  const data = (await resp.json()) as { errcode?: number; errmsg?: string; access_token?: string };
  if (data.errcode !== undefined && data.errcode !== 0) {
    throw new Error(`gettoken failed: ${data.errmsg ?? "unknown error"} (errcode=${data.errcode})`);
  }
  if (!data.access_token) {
    throw new Error("gettoken returned empty access_token");
  }
  accessTokenCache.set(key, {
    token: data.access_token,
    expiresAt: Date.now() + ACCESS_TOKEN_TTL_MS,
  });
  return data.access_token;
}

export function clearAccessTokenCache(account: ResolvedWecomAppAccount): void {
  const key = `${account.corpId}:${account.agentId ?? "default"}`;
  accessTokenCache.delete(key);
}

export function clearAllAccessTokenCache(): void {
  accessTokenCache.clear();
}

export type SendMessageResult = {
  ok: boolean;
  errcode?: number;
  errmsg?: string;
  invaliduser?: string;
  invalidparty?: string;
  invalidtag?: string;
  msgid?: string;
};

// ─────────────────────────────────────────────────────────────────────────────
// 入站媒体下载 (media_id -> 本地文件)
// ─────────────────────────────────────────────────────────────────────────────

export type SavedInboundMedia = {
  ok: boolean;
  path?: string;
  mimeType?: string;
  size?: number;
  filename?: string;
  error?: string;
};

const MIME_EXT_MAP: Record<string, string> = {
  "image/jpeg": ".jpg",
  "image/jpg": ".jpg",
  "image/png": ".png",
  "image/gif": ".gif",
  "image/webp": ".webp",
  "image/bmp": ".bmp",
  "application/pdf": ".pdf",
  "text/plain": ".txt",
};

function pickExtFromMime(mimeType?: string): string {
  const t = (mimeType ?? "").split(";")[0]?.trim().toLowerCase();
  return (t && MIME_EXT_MAP[t]) || "";
}

function parseContentDispositionFilename(headerValue?: string | null): string | undefined {
  const v = String(headerValue ?? "");
  if (!v) return undefined;
  const m1 = v.match(/filename\*=UTF-8''([^;]+)/i);
  if (m1?.[1]) {
    try {
      return decodeURIComponent(m1[1].trim().replace(/^"|"$/g, ""));
    } catch {
      return m1[1].trim().replace(/^"|"$/g, "");
    }
  }
  const m2 = v.match(/filename=([^;]+)/i);
  if (m2?.[1]) return m2[1].trim().replace(/^"|"$/g, "");
  return undefined;
}

export async function cleanupFile(filePath: string): Promise<void> {
  try {
    await unlink(filePath);
  } catch {
    // ignore
  }
}

function getWecomTempDir(): string {
  return join(tmpdir(), "wecom-app-media");
}

export async function downloadWecomMediaToFile(
  account: ResolvedWecomAppAccount,
  mediaId: string,
  opts: { dir?: string; maxBytes: number; prefix?: string }
): Promise<SavedInboundMedia> {
  const raw = String(mediaId ?? "").trim();
  if (!raw) return { ok: false, error: "mediaId/url is empty" };

  const isHttp = raw.startsWith("http://") || raw.startsWith("https://");
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), DOWNLOAD_TIMEOUT);

  let resp: Response;
  let contentType: string | undefined;
  let filenameFromHeader: string | undefined;

  try {
    if (isHttp) {
      resp = await fetch(raw, { signal: controller.signal });
      if (!resp.ok) {
        return { ok: false, error: `download failed: HTTP ${resp.status}` };
      }
      contentType = resp.headers.get("content-type") || undefined;
      filenameFromHeader = undefined;
    } else {
      if (!account.corpId || !account.corpSecret) {
        return { ok: false, error: "Account not configured for media download (missing corpId/corpSecret)" };
      }
      const safeMediaId = raw;
      const token = await getAccessToken(account);
      const url = `https://qyapi.weixin.qq.com/cgi-bin/media/get?access_token=${encodeURIComponent(token)}&media_id=${encodeURIComponent(safeMediaId)}`;
      resp = await fetch(url, { signal: controller.signal });
      if (!resp.ok) {
        return { ok: false, error: `media/get failed: HTTP ${resp.status}` };
      }
      contentType = resp.headers.get("content-type") || undefined;
      const cd = resp.headers.get("content-disposition");
      filenameFromHeader = parseContentDispositionFilename(cd);
      if ((contentType ?? "").includes("application/json")) {
        try {
          const j = (await resp.json()) as { errcode?: number; errmsg?: string };
          return { ok: false, error: `media/get returned json: errcode=${j?.errcode} errmsg=${j?.errmsg}` };
        } catch (err) {
          return { ok: false, error: err instanceof Error ? err.message : String(err) };
        }
      }
    }

    const contentLength = resp.headers.get("content-length");
    if (contentLength && opts.maxBytes > 0) {
      const declaredSize = parseInt(contentLength, 10);
      if (!Number.isNaN(declaredSize) && declaredSize > opts.maxBytes) {
        throw new FileSizeLimitError(declaredSize, opts.maxBytes, "media");
      }
    }

    const reader = resp.body?.getReader();
    if (!reader) {
      return { ok: false, error: "Response body is not readable" };
    }

    const chunks: Uint8Array[] = [];
    let totalSize = 0;
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      totalSize += value.length;
      if (opts.maxBytes > 0 && totalSize > opts.maxBytes) {
        reader.cancel();
        throw new FileSizeLimitError(totalSize, opts.maxBytes, "media");
      }
      chunks.push(value);
    }

    const buf = Buffer.concat(chunks.map(c => Buffer.from(c)));
    const baseDir = (opts.dir ?? "").trim() || getWecomTempDir();
    await mkdir(baseDir, { recursive: true });
    const prefix = (opts.prefix ?? "media").trim() || "media";
    const timestamp = Date.now();
    const randomSuffix = Math.random().toString(36).substring(2, 8);
    const extFromMime = pickExtFromMime(contentType);
    const extFromName = filenameFromHeader ? extname(filenameFromHeader) : (isHttp ? extname(raw.split("?")[0] || "") : "");
    const ext = extFromName || extFromMime || ".bin";
    const filename = `${prefix}_${timestamp}_${randomSuffix}${ext}`;
    const outPath = join(baseDir, filename);
    await writeFile(outPath, buf);
    return { ok: true, path: outPath, mimeType: contentType, size: buf.length, filename };
  } catch (err) {
    if (err instanceof Error && err.name === "AbortError") {
      throw new TimeoutError(DOWNLOAD_TIMEOUT);
    }
    throw err;
  } finally {
    clearTimeout(timeoutId);
  }
}

export async function sendWecomAppMessage(
  account: ResolvedWecomAppAccount,
  target: WecomAppSendTarget,
  message: string
): Promise<SendMessageResult> {
  if (!account.canSendActive) {
    return { ok: false, errcode: -1, errmsg: "Account not configured for active sending" };
  }
  const token = await getAccessToken(account);
  const text = stripMarkdown(message);
  const payload: Record<string, unknown> = { msgtype: "text", agentid: account.agentId, text: { content: text } };
  if (target.chatid) payload.chatid = target.chatid;
  else if (target.userId) payload.touser = target.userId;
  else return { ok: false, errcode: -1, errmsg: "No target specified" };
  const resp = await fetch(`https://qyapi.weixin.qq.com/cgi-bin/message/send?access_token=${encodeURIComponent(token)}`, {
    method: "POST", body: JSON.stringify(payload), headers: { "Content-Type": "application/json" },
  });
  const data = (await resp.json()) as SendMessageResult & { errcode?: number };
  return { ok: data.errcode === 0, errcode: data.errcode, errmsg: data.errmsg, invaliduser: data.invaliduser, invalidparty: data.invalidparty, invalidtag: data.invalidtag, msgid: data.msgid };
}

export async function sendWecomAppMarkdownMessage(
  account: ResolvedWecomAppAccount,
  target: WecomAppSendTarget,
  markdownContent: string
): Promise<SendMessageResult> {
  if (!account.canSendActive) return { ok: false, errcode: -1, errmsg: "Account not configured for active sending" };
  const token = await getAccessToken(account);
  const payload: Record<string, unknown> = { msgtype: "markdown", agentid: account.agentId, markdown: { content: markdownContent } };
  if (target.chatid) payload.chatid = target.chatid;
  else if (target.userId) payload.touser = target.userId;
  else return { ok: false, errcode: -1, errmsg: "No target specified" };
  const resp = await fetch(`https://qyapi.weixin.qq.com/cgi-bin/message/send?access_token=${encodeURIComponent(token)}`, {
    method: "POST", body: JSON.stringify(payload), headers: { "Content-Type": "application/json" },
  });
  const data = (await resp.json()) as SendMessageResult & { errcode?: number };
  return { ok: data.errcode === 0, errcode: data.errcode, errmsg: data.errmsg, invaliduser: data.invaliduser, invalidparty: data.invalidparty, invalidtag: data.invalidtag, msgid: data.msgid };
}

// ─────────────────────────────────────────────────────────────────────────────
// 图片/语音/视频/文件 支持
// ─────────────────────────────────────────────────────────────────────────────

const MIME_TYPE_MAP: Record<string, string> = {
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.gif': 'image/gif',
  '.bmp': 'image/bmp',
  '.webp': 'image/webp',
};

function getMimeType(filename: string, contentType?: string): string {
  if (contentType) return contentType.split(';')[0].trim();
  const ext = filename.toLowerCase().match(/\.[^.]+$/)?.[0];
  return MIME_TYPE_MAP[ext || ''] || 'image/jpeg';
}

function getVoiceMimeType(filename: string, contentType?: string): string {
  if (contentType) return contentType.split(';')[0].trim();
  const ext = filename.toLowerCase().match(/\.[^.]+$/)?.[0];
  const map: Record<string, string> = { '.amr': 'audio/amr', '.speex': 'audio/speex', '.mp3': 'audio/mpeg', '.wav': 'audio/wav' };
  return map[ext || ''] || 'audio/amr';
}

export async function downloadMediaBuffer(url: string): Promise<{ buffer: Buffer; contentType?: string }> {
  if (url.startsWith('http://') || url.startsWith('https://')) {
    console.log(`[wecom-app] Downloading media: ${url}`);
    const resp = await fetch(url);
    if (!resp.ok) throw new Error(`Download failed: HTTP ${resp.status}`);
    const ab = await resp.arrayBuffer();
    return { buffer: Buffer.from(ab), contentType: resp.headers.get('content-type') || undefined };
  } else {
    console.log(`[wecom-app] Reading local file: ${url}`);
    const fs = await import('fs');
    const buffer = await fs.promises.readFile(url);
    return { buffer, contentType: undefined };
  }
}

// 兼容别名
export const downloadImage = downloadMediaBuffer;
export const downloadVoice = downloadMediaBuffer;
export const downloadFile = downloadMediaBuffer;
export const downloadVideo = downloadMediaBuffer;

export async function uploadMedia(
  account: ResolvedWecomAppAccount,
  buffer: Buffer,
  filename: string,
  contentType: string | undefined,
  type: "image" | "voice" | "video" | "file"
): Promise<string> {
  if (!account.canSendActive) throw new Error("Account not configured for active sending");
  const token = await getAccessToken(account);
  const boundary = `----FormBoundary${Date.now()}`;
  const header = Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="media"; filename="${filename}"\r\nContent-Type: ${contentType || "application/octet-stream"}\r\n\r\n`);
  const footer = Buffer.from(`\r\n--${boundary}--\r\n`);
  const body = Buffer.concat([header, buffer, footer]);
  const resp = await fetch(`https://qyapi.weixin.qq.com/cgi-bin/media/upload?access_token=${encodeURIComponent(token)}&type=${type}`, {
    method: "POST", body: body, headers: { "Content-Type": `multipart/form-data; boundary=${boundary}` },
  });
  const data = (await resp.json()) as { errcode?: number; errmsg?: string; media_id?: string };
  if (data.errcode !== 0) throw new Error(`Upload ${type} failed: ${data.errmsg} (${data.errcode})`);
  if (!data.media_id) throw new Error(`Upload ${type} returned empty media_id`);
  return data.media_id;
}

// 兼容特定 upload 函数
export async function uploadImageMedia(account: ResolvedWecomAppAccount, buffer: Buffer, filename="image.jpg", contentType?: string) {
  return uploadMedia(account, buffer, filename, contentType || getMimeType(filename), "image");
}
export async function uploadVoiceMedia(account: ResolvedWecomAppAccount, buffer: Buffer, filename="voice.amr", contentType?: string) {
  return uploadMedia(account, buffer, filename, contentType || getVoiceMimeType(filename), "voice");
}

export async function sendWecomAppImageMessage(account: ResolvedWecomAppAccount, target: WecomAppSendTarget, mediaId: string): Promise<SendMessageResult> {
  if (!account.canSendActive) return { ok: false, errcode: -1, errmsg: "No active config" };
  const token = await getAccessToken(account);
  const payload: any = { msgtype: "image", agentid: account.agentId, image: { media_id: mediaId } };
  if (target.chatid) payload.chatid = target.chatid; else payload.touser = target.userId;
  const resp = await fetch(`https://qyapi.weixin.qq.com/cgi-bin/message/send?access_token=${encodeURIComponent(token)}`, { method: "POST", body: JSON.stringify(payload), headers: { "Content-Type": "application/json" } });
  const data: any = await resp.json();
  return { ok: data.errcode === 0, errcode: data.errcode, errmsg: data.errmsg, msgid: data.msgid };
}

export async function sendWecomAppVoiceMessage(account: ResolvedWecomAppAccount, target: WecomAppSendTarget, mediaId: string): Promise<SendMessageResult> {
  if (!account.canSendActive) return { ok: false, errcode: -1, errmsg: "No active config" };
  const token = await getAccessToken(account);
  const payload: any = { msgtype: "voice", agentid: account.agentId, voice: { media_id: mediaId } };
  if (target.chatid) payload.chatid = target.chatid; else payload.touser = target.userId;
  const resp = await fetch(`https://qyapi.weixin.qq.com/cgi-bin/message/send?access_token=${encodeURIComponent(token)}`, { method: "POST", body: JSON.stringify(payload), headers: { "Content-Type": "application/json" } });
  const data: any = await resp.json();
  return { ok: data.errcode === 0, errcode: data.errcode, errmsg: data.errmsg, msgid: data.msgid };
}

export async function sendWecomAppVideoMessage(account: ResolvedWecomAppAccount, target: WecomAppSendTarget, mediaId: string): Promise<SendMessageResult> {
  if (!account.canSendActive) return { ok: false, errcode: -1, errmsg: "No active config" };
  const token = await getAccessToken(account);
  const payload: any = { msgtype: "video", agentid: account.agentId, video: { media_id: mediaId } };
  if (target.chatid) payload.chatid = target.chatid; else payload.touser = target.userId;
  const resp = await fetch(`https://qyapi.weixin.qq.com/cgi-bin/message/send?access_token=${encodeURIComponent(token)}`, { method: "POST", body: JSON.stringify(payload), headers: { "Content-Type": "application/json" } });
  const data: any = await resp.json();
  return { ok: data.errcode === 0, errcode: data.errcode, errmsg: data.errmsg, msgid: data.msgid };
}

export async function sendWecomAppFileMessage(account: ResolvedWecomAppAccount, target: WecomAppSendTarget, mediaId: string): Promise<SendMessageResult> {
  if (!account.canSendActive) return { ok: false, errcode: -1, errmsg: "No active config" };
  const token = await getAccessToken(account);
  const payload: any = { msgtype: "file", agentid: account.agentId, file: { media_id: mediaId } };
  if (target.chatid) payload.chatid = target.chatid; else payload.touser = target.userId;
  const resp = await fetch(`https://qyapi.weixin.qq.com/cgi-bin/message/send?access_token=${encodeURIComponent(token)}`, { method: "POST", body: JSON.stringify(payload), headers: { "Content-Type": "application/json" } });
  const data: any = await resp.json();
  return { ok: data.errcode === 0, errcode: data.errcode, errmsg: data.errmsg, msgid: data.msgid };
}

export async function downloadAndSendImage(account: ResolvedWecomAppAccount, target: WecomAppSendTarget, url: string) {
  const { buffer, contentType } = await downloadMediaBuffer(url);
  const ext = url.match(/\.[^.]+$/)?.[0] || ".jpg";
  const mediaId = await uploadMedia(account, buffer, `image${ext}`, contentType, "image");
  return sendWecomAppImageMessage(account, target, mediaId);
}

export async function downloadAndSendVoice(account: ResolvedWecomAppAccount, target: WecomAppSendTarget, url: string) {
  const { buffer, contentType } = await downloadMediaBuffer(url);
  const ext = url.match(/\.[^.]+$/)?.[0] || ".amr";
  const mediaId = await uploadMedia(account, buffer, `voice${ext}`, contentType, "voice");
  return sendWecomAppVoiceMessage(account, target, mediaId);
}

export async function downloadAndSendVideo(account: ResolvedWecomAppAccount, target: WecomAppSendTarget, url: string) {
  const { buffer, contentType } = await downloadMediaBuffer(url);
  const ext = url.match(/\.[^.]+$/)?.[0] || ".mp4";
  const mediaId = await uploadMedia(account, buffer, `video${ext}`, contentType, "video");
  return sendWecomAppVideoMessage(account, target, mediaId);
}

export async function downloadAndSendFile(account: ResolvedWecomAppAccount, target: WecomAppSendTarget, url: string) {
  const { buffer, contentType } = await downloadMediaBuffer(url);
  const ext = url.match(/\.[^.]+$/)?.[0] || ".bin";
  const mediaId = await uploadMedia(account, buffer, `file${ext}`, contentType, "file");
  return sendWecomAppFileMessage(account, target, mediaId);
}
