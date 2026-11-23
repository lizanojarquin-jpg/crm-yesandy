import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";

// Transcribe las notas de voz (WhatsApp manda OGG/Opus) para que el equipo y la IA las puedan leer.
const MODELO = process.env.OPENROUTER_MODEL_AUDIO || "google/gemini-2.5-flash-lite";
const RESPALDO = ["google/gemini-2.5-flash"];
const MAX_BYTES = 8 * 1024 * 1024; // ~8 MB: varios minutos de nota de voz

const FORMATO: Record<string, string> = {
  "audio/ogg": "ogg",
  "audio/opus": "ogg",
  "audio/mpeg": "mp3",
  "audio/mp3": "mp3",
  "audio/mp4": "m4a",
  "audio/x-m4a": "m4a",
  "audio/aac": "aac",
  "audio/wav": "wav",
  "audio/x-wav": "wav",
  "audio/webm": "webm",
};

async function transcribirBytes(bytes: Buffer, mime: string): Promise<{ texto: string; costo: number | null }> {
  const key = process.env.OPENROUTER_API_KEY;
  if (!key) throw new Error("Falta OPENROUTER_API_KEY");
  const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
      "HTTP-Referer": process.env.NEXT_PUBLIC_SITE_URL ?? "https://crm.yesandycr.com",
      "X-Title": "CRM Yesandy",
    },
    body: JSON.stringify({
      models: [MODELO, ...RESPALDO],
      messages: [
        {
          role: "user",
          content: [
            {
              type: "text",
              text:
                "Transcribe literalmente esta nota de voz (español de Costa Rica). Devuelve solo la transcripción, " +
                "sin comillas ni comentarios. Si no se entiende nada, responde exactamente: [audio sin palabras]",
            },
            { type: "input_audio", input_audio: { data: bytes.toString("base64"), format: FORMATO[mime] ?? "ogg" } },
          ],
        },
      ],
      temperature: 0,
      max_tokens: 1200,
      usage: { include: true },
    }),
    cache: "no-store",
    signal: AbortSignal.timeout(45_000),
  });
  const body = await res.json().catch(() => null);
  if (!res.ok) throw new Error(`OpenRouter ${res.status}: ${JSON.stringify(body?.error ?? body).slice(0, 200)}`);
  const texto = String(body?.choices?.[0]?.message?.content ?? "")
    .replace(/(\s*\n\s*){3,}/g, "\n\n") // el modelo a veces repite saltos de línea
    .trim()
    .slice(0, 4000);
  return { texto, costo: body?.usage?.cost ?? null };
}

/** Transcribe los audios de un mensaje que todavía no tengan transcripción. Devuelve los textos. */
export async function transcribirAudiosDeMensaje(messageId: string): Promise<string[]> {
  const db = createAdminClient();
  const { data: adjuntos } = await db
    .from("attachments")
    .select("id, mime_type, storage_path, transcript")
    .eq("message_id", messageId)
    .eq("type", "audio");
  const textos: string[] = [];
  for (const a of adjuntos ?? []) {
    if (a.transcript) {
      textos.push(a.transcript);
      continue;
    }
    if (!a.storage_path) continue;
    const { data: archivo } = await db.storage.from("attachments").download(a.storage_path);
    if (!archivo || archivo.size > MAX_BYTES) continue;
    const mime = (a.mime_type ?? archivo.type ?? "audio/ogg").split(";")[0];
    const { texto } = await transcribirBytes(Buffer.from(await archivo.arrayBuffer()), mime);
    if (!texto) continue;
    await db.from("attachments").update({ transcript: texto }).eq("id", a.id);
    textos.push(texto);
  }
  return textos;
}
