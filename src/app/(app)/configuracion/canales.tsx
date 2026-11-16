import { createAdminClient } from "@/lib/supabase/admin";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { listWebhooks, WEBHOOK_NAME } from "@/lib/zernio/client";
import { conectarCanal } from "./canales-actions";
import { AccionCanal } from "./accion-canal";

async function estadoWebhook() {
  try {
    const w = (await listWebhooks()).find((x) => x.name === WEBHOOK_NAME);
    return w ? { activo: w.isActive, url: w.url } : null;
  } catch {
    return null;
  }
}

const NOMBRES: Record<string, string> = {
  whatsapp: "WhatsApp",
  facebook: "Facebook (Messenger y comentarios)",
  instagram: "Instagram (mensajes y comentarios)",
  tiktok: "TikTok (comentarios)",
};

export async function Canales({ conectado, error }: { conectado?: string; error?: string }) {
  const db = createAdminClient();
  const [{ data: cuentas }, convs, msgs, pendientes, webhook] = await Promise.all([
    db.from("channel_accounts").select("platform, display_name, status").order("platform"),
    db.from("conversations").select("id", { count: "exact", head: true }),
    db.from("messages").select("id", { count: "exact", head: true }),
    db.from("webhook_events").select("id", { count: "exact", head: true }).not("error", "is", null).is("processed_at", null),
    estadoWebhook(),
  ]);

  return (
    <div className="flex flex-col gap-3">
      {conectado && (
        <p className="rounded-lg bg-accent/10 px-3 py-2 text-sm text-accent">
          {NOMBRES[conectado] ?? conectado} conectado.
        </p>
      )}
      {error && <p className="rounded-lg bg-danger/10 px-3 py-2 text-sm text-danger">No se conectó: {error}</p>}

      {Object.entries(NOMBRES).map(([platform, nombre]) => {
        const c = cuentas?.find((x) => x.platform === platform);
        return (
          <Card key={platform} className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="font-medium">{nombre}</p>
              <p className="truncate text-xs text-muted">
                {c ? `${c.display_name} · ${c.status === "connected" ? "conectado" : "desconectado"}` : "Sin conectar"}
              </p>
            </div>
            <form action={conectarCanal}>
              <input type="hidden" name="platform" value={platform} />
              <Button variante={c?.status === "connected" ? "secundario" : "primario"} className="shrink-0">
                {c ? "Reconectar" : "Conectar"}
              </Button>
            </form>
          </Card>
        );
      })}

      <Card className="flex flex-col gap-3">
        <div>
          <p className="font-medium">Recepción de mensajes</p>
          <p className="text-xs text-muted">
            {webhook ? `Webhook ${webhook.activo ? "activo" : "pausado"} en ${webhook.url}` : "Webhook sin registrar"}
            {" · "}
            {convs.count ?? 0} conversaciones · {msgs.count ?? 0} mensajes guardados
            {pendientes.count ? ` · ${pendientes.count} evento(s) con error` : ""}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <AccionCanal accion="sincronizar" texto="Sincronizar canales" />
          <AccionCanal accion="importar" texto="Importar historial" />
          <AccionCanal accion="webhook" texto={webhook ? "Actualizar webhook" : "Activar webhook"} />
        </div>
      </Card>
    </div>
  );
}
