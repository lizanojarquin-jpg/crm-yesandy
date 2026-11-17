import "server-only";

// Cliente mínimo de OpenRouter (formato OpenAI). Solo servidor.
const URL_API = "https://openrouter.ai/api/v1/chat/completions";

export type Parte = { type: "text"; text: string } | { type: "image_url"; image_url: { url: string } };
export type MensajeIA = { role: "system" | "user" | "assistant"; content: string | Parte[] };

export async function completarJSON<T>(p: {
  model: string;
  respaldo?: string[];
  esReintento?: boolean;
  messages: MensajeIA[];
  schema: Record<string, unknown>;
  nombre: string;
  maxTokens?: number;
}): Promise<{ datos: T; costo: number | null }> {
  const key = process.env.OPENROUTER_API_KEY;
  if (!key) throw new Error("Falta OPENROUTER_API_KEY");
  const llamar = () =>
    fetch(URL_API, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
        "HTTP-Referer": process.env.NEXT_PUBLIC_SITE_URL ?? "https://crm-yesandy.vercel.app",
        "X-Title": "CRM Yesandy",
      },
      body: JSON.stringify({
        // Si el modelo principal está saturado, OpenRouter prueba el de respaldo.
        models: [p.model, ...(p.respaldo ?? []).filter((m) => m !== p.model)],
        messages: p.messages,
        temperature: 0,
        max_tokens: p.maxTokens ?? 300,
        response_format: { type: "json_schema", json_schema: { name: p.nombre, strict: true, schema: p.schema } },
        usage: { include: true },
      }),
      cache: "no-store",
      signal: AbortSignal.timeout(30_000),
    });

  let res = await llamar();
  // Reintentos ante saturación del proveedor (429) o fallas temporales (5xx).
  for (let intento = 1; intento <= 2 && (res.status === 429 || res.status >= 500); intento++) {
    await new Promise((r) => setTimeout(r, 1500 * intento));
    res = await llamar();
  }
  const body = await res.json().catch(() => null);
  if (!res.ok) throw new Error(`OpenRouter ${res.status}: ${JSON.stringify(body?.error ?? body).slice(0, 300)}`);
  const texto: string = body?.choices?.[0]?.message?.content ?? "";
  try {
    // Algunos modelos envuelven el JSON en ```json … ```.
    const json = texto.match(/\{[\s\S]*\}/)?.[0];
    if (!json) throw new Error("sin JSON");
    return { datos: JSON.parse(json) as T, costo: body?.usage?.cost ?? null };
  } catch {
    // Respuesta dañada: se repite una vez con el modelo de respaldo.
    if (p.respaldo?.length && !p.esReintento) {
      return completarJSON<T>({ ...p, model: p.respaldo[0], respaldo: [], esReintento: true });
    }
    throw new Error(`Respuesta sin JSON válido: ${texto.slice(0, 200)}`);
  }
}
