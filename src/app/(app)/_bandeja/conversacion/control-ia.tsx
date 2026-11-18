import { alternarContactoPrueba, cambiarIAConversacion } from "../acciones";
import type { ModoIA } from "@/lib/ia/asesora";

/** Sección de la ficha: si la asesora IA responde en esta conversación. */
export function ControlIA({
  conversationId,
  contactId,
  esComentario,
  aiMode,
  modoGlobal,
  esPrueba,
  esAdmin,
}: {
  conversationId: string;
  contactId: string;
  esComentario: boolean;
  aiMode: "on" | "off" | "handoff";
  modoGlobal: ModoIA;
  esPrueba: boolean;
  esAdmin: boolean;
}) {
  let estado: string;
  if (esComentario) estado = "No responde comentarios.";
  else if (aiMode === "handoff") estado = "Pasó la conversación a vendedora.";
  else if (aiMode === "off") estado = "Apagada en esta conversación.";
  else if (modoGlobal === "apagada") estado = "Apagada para todos (Configuración).";
  else if (modoGlobal === "pruebas" && !esPrueba) estado = "En modo pruebas: este contacto no está incluido.";
  else estado = "Responde si nadie del equipo escribió en las últimas 24 h.";

  return (
    <section className="flex flex-col gap-2">
      <h3 className="text-xs font-semibold tracking-wide text-muted uppercase">Asesora IA</h3>
      <p className="text-sm">{estado}</p>
      {!esComentario && (
        <div className="flex flex-wrap gap-2">
          <form action={cambiarIAConversacion.bind(null, conversationId, aiMode === "on" ? "off" : "on")}>
            <button className="h-9 rounded-lg border border-border px-3 text-sm font-medium">
              {aiMode === "on" ? "Apagar IA aquí" : "Volver a encender IA aquí"}
            </button>
          </form>
          {esAdmin && (
            <form action={alternarContactoPrueba.bind(null, contactId)}>
              <button className="h-9 rounded-lg border border-border px-3 text-sm font-medium">
                {esPrueba ? "Quitar de pruebas" : "Usar para probar la IA"}
              </button>
            </form>
          )}
        </div>
      )}
    </section>
  );
}
