import { after, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { verifyZernioSignature } from "@/lib/zernio/signature";
import { processZernioEvent } from "@/lib/zernio/ingest";

// La asesora IA espera unos segundos por si el cliente sigue escribiendo y luego piensa y envía.
export const maxDuration = 120;

// Webhook de Zernio. Flujo:
// 1. Valida la firma HMAC del cuerpo crudo (si no coincide: 401, no se guarda nada).
// 2. Guarda el evento crudo (único por X-Zernio-Event-Id → los reintentos no duplican).
// 3. Responde 200 de inmediato (Zernio exige < 5 s) y procesa después con after().
export async function POST(request: Request) {
  const raw = await request.text();
  const secret = process.env.ZERNIO_WEBHOOK_SECRET ?? "";
  if (!verifyZernioSignature(raw, request.headers.get("x-zernio-signature"), secret)) {
    return NextResponse.json({ error: "firma inválida" }, { status: 401 });
  }

  let payload: { id?: string; event?: string } & Record<string, unknown>;
  try {
    payload = JSON.parse(raw);
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
  }

  const eventId = request.headers.get("x-zernio-event-id") ?? payload.id;
  const eventType = request.headers.get("x-zernio-event") ?? payload.event ?? "desconocido";
  if (!eventId) return NextResponse.json({ error: "falta id del evento" }, { status: 400 });

  const db = createAdminClient();
  const { data: inserted, error } = await db
    .from("webhook_events")
    .upsert(
      { zernio_event_id: eventId, event_type: eventType, payload: payload as never },
      { onConflict: "zernio_event_id", ignoreDuplicates: true },
    )
    .select("id");
  if (error) {
    // 500 → Zernio reintenta más tarde.
    return NextResponse.json({ error: "no se pudo guardar" }, { status: 500 });
  }
  if (!inserted?.length) return NextResponse.json({ ok: true, duplicate: true });

  const rowId = inserted[0].id;
  after(async () => {
    try {
      const result = await processZernioEvent(payload);
      await db
        .from("webhook_events")
        .update({ processed_at: new Date().toISOString(), error: result.status === "ignored" ? `ignorado: ${result.detail}` : null })
        .eq("id", rowId);
    } catch (e) {
      await db
        .from("webhook_events")
        .update({ error: e instanceof Error ? e.message : String(e) })
        .eq("id", rowId);
    }
  });

  return NextResponse.json({ ok: true });
}
