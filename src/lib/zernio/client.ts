import "server-only";

// Cliente mínimo de la API de Zernio (https://zernio.com/api/v1). Solo servidor.
const BASE = "https://zernio.com/api/v1";

export class ZernioError extends Error {
  constructor(
    message: string,
    public status: number,
    public body: unknown,
  ) {
    super(message);
  }
}

function apiKey() {
  const key = process.env.ZERNIO_API_KEY;
  if (!key) throw new Error("Falta ZERNIO_API_KEY");
  return key;
}

export async function zernio<T>(
  path: string,
  init: RequestInit & { query?: Record<string, string | number | boolean | undefined> } = {},
): Promise<T> {
  const url = new URL(BASE + path);
  for (const [k, v] of Object.entries(init.query ?? {})) {
    if (v !== undefined) url.searchParams.set(k, String(v));
  }
  const res = await fetch(url, {
    ...init,
    headers: {
      Authorization: `Bearer ${apiKey()}`,
      ...(typeof init.body === "string" ? { "Content-Type": "application/json" } : {}),
      ...init.headers,
    },
    cache: "no-store",
  });
  const text = await res.text();
  const body = text ? safeJson(text) : null;
  if (!res.ok) {
    const msg = (body as { error?: string } | null)?.error ?? res.statusText;
    throw new ZernioError(`Zernio ${res.status}: ${msg}`, res.status, body);
  }
  return body as T;
}

function safeJson(t: string) {
  try {
    return JSON.parse(t);
  } catch {
    return t;
  }
}

// ---------- Tipos (solo los campos que usamos) ----------
export type ZernioPlatform = "whatsapp" | "facebook" | "instagram" | "tiktok" | string;

export type ZernioAccount = {
  _id: string;
  platform: ZernioPlatform;
  username?: string | null;
  displayName?: string | null;
  isActive?: boolean;
  needsReconnection?: boolean;
  profileId?: { _id: string } | string;
};

export type ZernioAttachment = {
  type: string;
  mimeType?: string | null;
  url?: string | null;
  filename?: string | null;
};

export type ZernioConversation = {
  id: string;
  accountId: string;
  platform: ZernioPlatform;
  participantId?: string | null;
  participantName?: string | null;
  participantUsername?: string | null;
  updatedTime?: string;
};

export type ZernioListedMessage = {
  id: string;
  conversationId: string;
  accountId: string;
  platform: ZernioPlatform;
  message?: string | null;
  senderId?: string | null;
  senderName?: string | null;
  senderPhoneNumber?: string | null;
  direction: "incoming" | "outgoing";
  attachments?: ZernioAttachment[];
  sentAt?: string | null;
  createdAt?: string | null;
  deliveryStatus?: string | null;
};

// ---------- Llamadas ----------
export async function getDefaultProfileId(): Promise<string> {
  const { profiles } = await zernio<{ profiles: { _id: string; isDefault?: boolean }[] }>("/profiles");
  const p = profiles.find((x) => x.isDefault) ?? profiles[0];
  if (!p) throw new Error("La cuenta de Zernio no tiene perfiles");
  return p._id;
}

export async function listAccounts(): Promise<ZernioAccount[]> {
  const { accounts } = await zernio<{ accounts: ZernioAccount[] }>("/accounts");
  return accounts;
}

export async function getConnectUrl(platform: string, redirectUrl: string): Promise<string> {
  const profileId = await getDefaultProfileId();
  // WhatsApp sin "onboarding" = coexistencia (el número sigue en la app del celular).
  const { authUrl } = await zernio<{ authUrl: string }>(`/connect/${platform}`, {
    query: { profileId, redirect_url: redirectUrl },
  });
  return authUrl;
}

export async function listConversations(accountId: string, cursor?: string) {
  return zernio<{ data: ZernioConversation[]; pagination?: { hasMore: boolean; nextCursor?: string | null } }>(
    "/inbox/conversations",
    { query: { accountId, limit: 100, cursor } },
  );
}

export async function listMessages(conversationId: string, accountId: string, cursor?: string) {
  return zernio<{ messages: ZernioListedMessage[]; pagination?: { hasMore: boolean; nextCursor?: string | null } }>(
    `/inbox/conversations/${encodeURIComponent(conversationId)}/messages`,
    { query: { accountId, limit: 100, cursor } },
  );
}

// ---------- Envío ----------
function idem(key?: string): HeadersInit | undefined {
  return key ? { "Idempotency-Key": key } : undefined;
}

/** Envía un mensaje directo. Devuelve el id de la plataforma (el mismo que llega por webhook). */
export async function sendInboxMessage(
  conversationId: string,
  p: {
    accountId: string;
    message?: string;
    attachmentUrl?: string;
    attachmentType?: "image" | "video" | "audio" | "file";
    humanAgentTag?: boolean;
    idempotencyKey?: string;
  },
): Promise<{ messageId: string }> {
  const body: Record<string, unknown> = { accountId: p.accountId };
  if (p.message) body.message = p.message;
  if (p.attachmentUrl) {
    body.attachmentUrl = p.attachmentUrl;
    body.attachmentType = p.attachmentType ?? "image";
  }
  if (p.humanAgentTag) {
    // Facebook/Instagram fuera de las 24 h: respuesta de una persona (hasta 7 días).
    body.messagingType = "MESSAGE_TAG";
    body.messageTag = "HUMAN_AGENT";
  }
  const r = await zernio<{ data: { messageId: string } }>(
    `/inbox/conversations/${encodeURIComponent(conversationId)}/messages`,
    { method: "POST", body: JSON.stringify(body), headers: idem(p.idempotencyKey) },
  );
  return { messageId: r.data.messageId };
}

// ---------- Plantillas de WhatsApp ----------
export type Plantilla = {
  id: string;
  name: string;
  language: string;
  status: string;
  category: string;
  components?: { type: string; text?: string; format?: string }[];
};

export async function listTemplates(accountId: string): Promise<Plantilla[]> {
  const r = await zernio<{ templates: Plantilla[] }>("/whatsapp/templates", { query: { accountId } });
  return r.templates ?? [];
}

/** Manda una plantilla a revisión de Meta (tarda hasta 24 h). */
export async function createTemplate(p: {
  accountId: string;
  name: string;
  category: "UTILITY" | "MARKETING";
  language: string;
  text: string;
  examples: string[];
}): Promise<{ status: string }> {
  const body: Record<string, unknown> = { type: "body", text: p.text };
  if (p.examples.length) body.example = { body_text: [p.examples] };
  const r = await zernio<{ template: { status: string } }>("/whatsapp/templates", {
    method: "POST",
    body: JSON.stringify({ accountId: p.accountId, name: p.name, category: p.category, language: p.language, components: [body] }),
  });
  return { status: r.template?.status ?? "PENDING" };
}

/** Envía una plantilla aprobada dentro de una conversación de WhatsApp (sirve fuera de las 24 h). */
export async function sendTemplate(
  conversationId: string,
  p: { accountId: string; name: string; language: string; params: string[]; idempotencyKey?: string },
): Promise<{ messageId: string | null }> {
  const element: Record<string, unknown> = { name: p.name, language: p.language };
  if (p.params.length) {
    element.components = [{ type: "body", parameters: p.params.map((text) => ({ type: "text", text })) }];
  }
  const r = await zernio<{ data?: { messageId?: string } }>(
    `/inbox/conversations/${encodeURIComponent(conversationId)}/messages`,
    {
      method: "POST",
      body: JSON.stringify({ accountId: p.accountId, template: { elements: [element] } }),
      headers: idem(p.idempotencyKey),
    },
  );
  return { messageId: r.data?.messageId ?? null };
}

/** Responde en público a un comentario. */
export async function replyToComment(
  postId: string,
  p: { accountId: string; commentId: string; message: string; idempotencyKey?: string },
): Promise<{ commentId: string }> {
  const r = await zernio<{ data: { commentId: string } }>(`/inbox/comments/${encodeURIComponent(postId)}`, {
    method: "POST",
    body: JSON.stringify({ accountId: p.accountId, commentId: p.commentId, message: p.message }),
    headers: idem(p.idempotencyKey),
  });
  return { commentId: r.data.commentId };
}

/** Respuesta privada (mensaje directo) a un comentario. Solo Facebook e Instagram, una vez por comentario, hasta 7 días. */
export async function privateReplyToComment(
  postId: string,
  commentId: string,
  p: { accountId: string; message: string },
): Promise<{ messageId: string | null }> {
  const r = await zernio<{ messageId?: string }>(
    `/inbox/comments/${encodeURIComponent(postId)}/${encodeURIComponent(commentId)}/private-reply`,
    { method: "POST", body: JSON.stringify({ accountId: p.accountId, message: p.message }) },
  );
  return { messageId: r.messageId ?? null };
}

/** Marca la conversación como leída en la plataforma (en WhatsApp envía los checks azules). */
export async function markConversationRead(conversationId: string, accountId: string) {
  await zernio(`/inbox/conversations/${encodeURIComponent(conversationId)}/read`, {
    method: "POST",
    body: JSON.stringify({ accountId }),
  });
}

/** Descarga un adjunto. Las URLs de WhatsApp de Zernio piden la API key. */
export async function downloadAttachment(url: string): Promise<{ bytes: ArrayBuffer; contentType: string | null }> {
  const isZernio = url.startsWith("/") || new URL(url).hostname.endsWith("zernio.com");
  const full = url.startsWith("/") ? `https://zernio.com${url.startsWith("/api") ? "" : "/api"}${url}` : url;
  const res = await fetch(full, {
    headers: isZernio ? { Authorization: `Bearer ${apiKey()}` } : undefined,
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`No se pudo descargar el adjunto (${res.status})`);
  return { bytes: await res.arrayBuffer(), contentType: res.headers.get("content-type") };
}

export type WebhookSetting = { _id: string; name: string; url: string; events: string[]; isActive: boolean };

export const WEBHOOK_EVENTS = [
  "message.received",
  "message.sent",
  "message.delivered",
  "message.read",
  "message.failed",
  "comment.received",
] as const;

export async function listWebhooks() {
  const { webhooks } = await zernio<{ webhooks: WebhookSetting[] }>("/webhooks/settings");
  return webhooks;
}

export const WEBHOOK_NAME = "CRM Yesandy";

/** Crea o actualiza el endpoint del CRM en Zernio, con el secreto para firmar. */
export async function registerWebhook(url: string): Promise<WebhookSetting> {
  const secret = process.env.ZERNIO_WEBHOOK_SECRET;
  if (!secret) throw new Error("Falta ZERNIO_WEBHOOK_SECRET");
  const existing = (await listWebhooks()).find((w) => w.name === WEBHOOK_NAME);
  const body = { name: WEBHOOK_NAME, url, events: [...WEBHOOK_EVENTS], secret, isActive: true };
  if (existing) {
    const r = await zernio<{ webhook: WebhookSetting }>("/webhooks/settings", {
      method: "PUT",
      body: JSON.stringify({ webhookId: existing._id, ...body }),
    });
    return r.webhook ?? { ...existing, ...body };
  }
  const r = await zernio<{ webhook: WebhookSetting }>("/webhooks/settings", {
    method: "POST",
    body: JSON.stringify(body),
  });
  return r.webhook;
}

export async function sendTestWebhook(webhookId: string) {
  return zernio("/webhooks/test", { method: "POST", body: JSON.stringify({ webhookId }) });
}
