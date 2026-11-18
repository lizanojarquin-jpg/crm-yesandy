import { createAdminClient } from "@/lib/supabase/admin";
import { Card } from "@/components/ui/card";
import { Chip } from "@/components/ui/chip";
import { leerAjustesIA, type ModoIA } from "@/lib/ia/asesora";
import { fechaLarga, horaCorta } from "@/lib/formato";
import { cambiarModoIA, sincronizarCatalogoAccion } from "./ia-actions";
import { ConocimientoForm } from "./conocimiento-form";

const MODOS: { valor: ModoIA; titulo: string; ayuda: string }[] = [
  { valor: "apagada", titulo: "Apagada", ayuda: "No responde a nadie." },
  { valor: "pruebas", titulo: "Solo pruebas", ayuda: "Responde solo a los contactos marcados para probar (desde la ficha)." },
  { valor: "encendida", titulo: "Encendida", ayuda: "Responde a todos los mensajes directos nuevos." },
];

const ESTADO_RUN: Record<string, string> = {
  respondio: "Respondió",
  traspaso: "Pasó a vendedora",
  omitido: "No respondió",
  error: "Error",
  pendiente: "Pensando",
};

export async function Asesora() {
  const db = createAdminClient();
  const inicioHoy = new Date(new Date().toLocaleDateString("en-CA", { timeZone: "America/Costa_Rica" }) + "T00:00:00-06:00").toISOString();
  const [ajustes, catalogo, ultimoSync, conocimiento, hoy, ultimos] = await Promise.all([
    leerAjustesIA(),
    db.from("catalog_items").select("id", { count: "exact", head: true }).eq("active", true),
    db.from("catalog_items").select("synced_at").order("synced_at", { ascending: false }).limit(1).maybeSingle(),
    db.from("business_knowledge").select("key, title, content").order("sort_order"),
    db.from("ai_runs").select("status, cost_usd").gte("created_at", inicioHoy),
    db
      .from("ai_runs")
      .select("id, status, detail, created_at, conversation_id")
      .neq("status", "omitido")
      .order("created_at", { ascending: false })
      .limit(8),
  ]);
  const runs = hoy.data ?? [];
  const cuenta = (s: string) => runs.filter((r) => r.status === s).length;
  const costoHoy = runs.reduce((t, r) => t + Number(r.cost_usd ?? 0), 0);

  return (
    <div className="flex flex-col gap-3">
      <p className="text-sm text-muted">
        Contesta primero los mensajes directos de WhatsApp, Messenger e Instagram como asesora: pregunta la ocasión, el estilo y la talla,
        envía fotos del catálogo y pasa la conversación a una vendedora para confirmar talla, color y precio. No responde comentarios, ni
        cuando una persona del equipo escribió en las últimas 24 horas, ni a clientes con pedido en curso.
      </p>

      <Card className="flex flex-col gap-3">
        <p className="font-medium">Estado</p>
        <form action={cambiarModoIA} className="flex flex-col gap-2">
          {MODOS.map((m) => (
            <label key={m.valor} className="flex cursor-pointer items-start gap-3 rounded-lg border border-border px-3 py-2 has-[:checked]:border-accent">
              <input type="radio" name="modo" value={m.valor} defaultChecked={ajustes.modo === m.valor} className="mt-1 accent-[var(--color-accent)]" />
              <span>
                <span className="block text-sm font-medium">{m.titulo}</span>
                <span className="block text-xs text-muted">{m.ayuda}</span>
              </span>
            </label>
          ))}
          <button className="h-10 self-start rounded-lg bg-accent px-4 text-sm font-medium text-accent-foreground">Guardar</button>
        </form>
        <p className="text-xs text-muted">
          Contactos de prueba: {ajustes.contactosPrueba.length}. Antes de encenderla para todos, apaga el mensaje de bienvenida y el de
          ausencia de WhatsApp Business y las respuestas automáticas de Meta, para que el cliente no reciba dos saludos.
        </p>
      </Card>

      <Card className="flex flex-col gap-2">
        <p className="font-medium">Hoy</p>
        <div className="flex flex-wrap gap-2">
          <Chip tono="acento">Respondió {cuenta("respondio")}</Chip>
          <Chip tono="aviso">Pasó a vendedora {cuenta("traspaso")}</Chip>
          <Chip>No respondió {cuenta("omitido")}</Chip>
          {cuenta("error") > 0 && <Chip>Errores {cuenta("error")}</Chip>}
          <span className="text-xs text-muted">Costo US$ {costoHoy.toFixed(3)}</span>
        </div>
        {(ultimos.data ?? []).length > 0 && (
          <ul className="mt-1 flex flex-col gap-2">
            {(ultimos.data ?? []).map((r) => (
              <li key={r.id} className="text-sm">
                <a href={`/c/${r.conversation_id}`} className="font-medium hover:underline">
                  {ESTADO_RUN[r.status] ?? r.status}
                </a>
                <span className="text-xs text-muted"> · {horaCorta(r.created_at)}</span>
                {r.detail && <p className="line-clamp-2 text-xs text-muted">{r.detail}</p>}
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card className="flex flex-col gap-2">
        <p className="font-medium">Catálogo de shop.yesandycr.com</p>
        <p className="text-sm text-muted">
          {catalogo.count ?? 0} productos
          {ultimoSync.data ? ` · copiado el ${fechaLarga(ultimoSync.data.synced_at)} a las ${horaCorta(ultimoSync.data.synced_at)}` : " · todavía no se ha copiado"}
          {" "}(se actualiza solo cada 12 horas)
        </p>
        <form action={sincronizarCatalogoAccion}>
          <button className="text-sm font-medium text-accent">Actualizar ahora</button>
        </form>
      </Card>

      <Card className="flex flex-col gap-4">
        <div>
          <p className="font-medium">Lo que la IA sabe del negocio</p>
          <p className="text-sm text-muted">La IA solo responde con esto. Lo que no esté aquí lo pasa a una vendedora.</p>
        </div>
        {(conocimiento.data ?? []).map((k) => (
          <ConocimientoForm key={k.key} clave={k.key} titulo={k.title} contenido={k.content} />
        ))}
      </Card>
    </div>
  );
}
