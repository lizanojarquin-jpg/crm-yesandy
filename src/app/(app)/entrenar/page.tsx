import Link from "next/link";
import { getUsuarioActual } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { listarEquipo } from "@/lib/inbox/queries";
import { Card } from "@/components/ui/card";
import { Chip } from "@/components/ui/chip";
import { fechaLarga } from "@/lib/formato";
import { Practica } from "./practica";
import { EditarLeccionForm, NuevaReglaForm, NuevoTemaForm, TemaForm } from "./formularios";
import { borrarLeccion, borrarTema, cambiarEstadoLeccion } from "./acciones";

export const metadata = { title: "Entrenar IA · CRM Yesandy" };

const PESTANAS = [
  { id: "practicar", texto: "Practicar" },
  { id: "lecciones", texto: "Reglas y correcciones" },
  { id: "informacion", texto: "Información del negocio" },
] as const;
type Pestana = (typeof PESTANAS)[number]["id"];

type Leccion = {
  id: string;
  kind: "regla" | "correccion";
  situation: string | null;
  original_reply: string | null;
  content: string;
  reason: string | null;
  status: "propuesta" | "activa" | "archivada";
  created_by: string | null;
  approved_by: string | null;
  created_at: string;
};

export default async function EntrenarPage({ searchParams }: { searchParams: Promise<{ ver?: string }> }) {
  const usuario = await getUsuarioActual();
  const esAdmin = usuario.rol === "admin";
  const { ver } = await searchParams;
  const pestana: Pestana = PESTANAS.some((p) => p.id === ver) ? (ver as Pestana) : "practicar";

  const sb = await createClient();
  const [{ data: lecciones }, { data: temas }, equipo] = await Promise.all([
    sb
      .from("ai_lessons")
      .select("id, kind, situation, original_reply, content, reason, status, created_by, approved_by, created_at")
      .order("created_at", { ascending: false })
      .limit(300)
      .returns<Leccion[]>(),
    sb.from("business_knowledge").select("key, title, content").order("sort_order"),
    listarEquipo(),
  ]);
  const nombres = new Map(equipo.map((p) => [p.id, p.display_name]));
  const todas = lecciones ?? [];
  const porAprobar = todas.filter((l) => l.status === "propuesta");

  return (
    <div className="mx-auto max-w-3xl px-4 py-6">
      <h1 className="text-xl font-semibold">Entrenar IA</h1>
      <p className="text-sm text-muted">
        Lo que se enseña aquí la asesora lo lee antes de cada respuesta.{" "}
        {esAdmin ? "Lo que guardas se aplica de una vez." : "Lo que propones lo aprueba un administrador."}
      </p>

      <nav aria-label="Secciones" className="-mx-4 mt-4 flex gap-2 overflow-x-auto px-4 pb-1">
        {PESTANAS.map((p) => (
          <Link
            key={p.id}
            href={p.id === "practicar" ? "/entrenar" : `/entrenar?ver=${p.id}`}
            aria-current={pestana === p.id ? "page" : undefined}
            className={`shrink-0 rounded-full border px-3 py-1.5 text-sm font-medium ${
              pestana === p.id ? "border-accent bg-accent text-accent-foreground" : "border-border bg-surface text-muted"
            }`}
          >
            {p.texto}
            {p.id === "lecciones" && porAprobar.length > 0 && (
              <span className="ml-1.5 rounded-full bg-amber-500 px-1.5 text-[11px] text-white">{porAprobar.length}</span>
            )}
          </Link>
        ))}
      </nav>

      <div className="mt-5">
        {pestana === "practicar" && <Practica />}

        {pestana === "lecciones" && (
          <div className="flex flex-col gap-6">
            <Card>
              <NuevaReglaForm esAdmin={esAdmin} />
            </Card>
            <p className="text-xs text-muted">
              Las correcciones se hacen con el botón <b>Corregir</b> debajo de cada respuesta de la IA, en Practicar o en las conversaciones reales.
            </p>
            <Lista titulo="Por aprobar" ayuda="Propuestas del equipo. La IA todavía no las usa." lecciones={porAprobar} esAdmin={esAdmin} nombres={nombres} />
            <Lista
              titulo="Activas"
              ayuda="La IA las aplica en cada respuesta."
              lecciones={todas.filter((l) => l.status === "activa")}
              esAdmin={esAdmin}
              nombres={nombres}
              vacio="Todavía no hay reglas ni correcciones activas."
            />
            {todas.some((l) => l.status === "archivada") && (
              <details>
                <summary className="cursor-pointer text-sm font-medium text-muted">Archivadas</summary>
                <div className="mt-3">
                  <Lista titulo="" lecciones={todas.filter((l) => l.status === "archivada")} esAdmin={esAdmin} nombres={nombres} />
                </div>
              </details>
            )}
          </div>
        )}

        {pestana === "informacion" && (
          <div className="flex flex-col gap-4">
            <p className="text-sm text-muted">
              Datos del negocio que la IA puede responder sola. Lo que no esté aquí lo pasa a una vendedora.
            </p>
            <Card className="flex flex-col gap-5">
              {(temas ?? []).map((t) =>
                esAdmin ? (
                  <div key={t.key} className="flex flex-col gap-1">
                    <TemaForm clave={t.key} titulo={t.title} contenido={t.content} />
                    <form action={borrarTema.bind(null, t.key)}>
                      <button className="text-xs text-muted hover:text-danger">Quitar este tema</button>
                    </form>
                  </div>
                ) : (
                  <div key={t.key}>
                    <p className="text-sm font-medium">{t.title}</p>
                    <p className="text-sm whitespace-pre-wrap text-muted">{t.content}</p>
                  </div>
                ),
              )}
            </Card>
            {esAdmin && (
              <Card>
                <NuevoTemaForm />
              </Card>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function Lista({
  titulo,
  ayuda,
  lecciones,
  esAdmin,
  nombres,
  vacio,
}: {
  titulo: string;
  ayuda?: string;
  lecciones: Leccion[];
  esAdmin: boolean;
  nombres: Map<string, string>;
  vacio?: string;
}) {
  if (!lecciones.length && !vacio) return null;
  return (
    <section className="flex flex-col gap-2">
      {titulo && (
        <div className="flex items-baseline gap-2">
          <h2 className="text-sm font-semibold tracking-wide text-muted uppercase">{titulo}</h2>
          <span className="text-xs text-muted">{lecciones.length}</span>
        </div>
      )}
      {ayuda && <p className="text-xs text-muted">{ayuda}</p>}
      {!lecciones.length && <p className="text-sm text-muted">{vacio}</p>}
      {lecciones.map((l) => (
        <Card key={l.id} className="flex flex-col gap-1.5">
          <div className="flex flex-wrap items-center gap-2">
            <Chip tono={l.kind === "regla" ? "acento" : "neutro"}>{l.kind === "regla" ? "Regla" : "Corrección"}</Chip>
            <span className="text-xs text-muted">
              {l.created_by ? nombres.get(l.created_by) ?? "Equipo" : "Equipo"} · {fechaLarga(l.created_at)}
              {l.status === "activa" && l.approved_by && l.approved_by !== l.created_by
                ? ` · aprobó ${nombres.get(l.approved_by) ?? "un administrador"}`
                : ""}
            </span>
          </div>
          {l.kind === "correccion" && (
            <>
              {l.situation && <p className="text-sm text-muted">Cliente: “{l.situation}”</p>}
              {l.original_reply && <p className="text-sm text-muted line-through decoration-danger/60">IA: {l.original_reply}</p>}
            </>
          )}
          <p className="text-sm whitespace-pre-wrap">
            {l.kind === "correccion" ? <span className="font-medium">Debe responder: </span> : null}
            {l.content}
          </p>
          {l.reason && <p className="text-xs text-muted italic">Por qué: {l.reason}</p>}
          {esAdmin && (
            <div className="mt-1 flex flex-wrap items-center gap-3">
              {l.status !== "activa" && (
                <form action={cambiarEstadoLeccion.bind(null, l.id, "activa")}>
                  <button className="h-8 rounded-lg bg-accent px-3 text-xs font-medium text-accent-foreground">
                    {l.status === "propuesta" ? "Aprobar" : "Volver a activar"}
                  </button>
                </form>
              )}
              {l.status !== "archivada" && (
                <form action={cambiarEstadoLeccion.bind(null, l.id, "archivada")}>
                  <button className="text-xs font-medium text-muted hover:text-foreground">
                    {l.status === "propuesta" ? "Descartar" : "Archivar"}
                  </button>
                </form>
              )}
              <form action={borrarLeccion.bind(null, l.id)}>
                <button className="text-xs text-muted hover:text-danger">Borrar</button>
              </form>
              <details className="w-full">
                <summary className="cursor-pointer text-xs font-medium text-accent">Editar</summary>
                <EditarLeccionForm id={l.id} content={l.content} reason={l.reason} />
              </details>
            </div>
          )}
        </Card>
      ))}
    </section>
  );
}
