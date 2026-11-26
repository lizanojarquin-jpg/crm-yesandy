"use client";

import { startTransition, useActionState, useEffect, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { convertirAOgg, puedeConvertirAOgg } from "@/lib/audio/ogg-opus";
import { convertirAMp3 } from "@/lib/audio/mp3";
import { comprimirFoto, esFoto, prepararFoto } from "@/lib/fotos";
import { reportarFalla } from "@/lib/diagnostico-cliente";
import { pedirMicrofono } from "@/lib/microfono";
import { enviar, escribiendo, prepararSubida, type Estado } from "../acciones";
import { PlantillaPicker, type PlantillaOpcion } from "./plantilla-picker";
import { Grabadora } from "./grabadora";

const SIN_NOTA_DE_VOZ = "No se pudo preparar el audio para WhatsApp. Actualiza el sistema del celular y el navegador e intenta de nuevo.";

/** Nota de voz OGG/Opus; si el navegador no puede (o falla), MP3. */
async function prepararAudioWhatsApp(grabado: File): Promise<File> {
  if (await puedeConvertirAOgg()) {
    try {
      return await convertirAOgg(grabado);
    } catch (e) {
      reportarFalla("nota de voz OGG (se usa MP3)", e);
    }
  }
  return convertirAMp3(grabado);
}

/** Fotos que se pueden juntar para enviar de una vez. */
const MAX_FOTOS = 30;
/** Salen en grupos de este tamaño (el máximo por envío del servidor). */
const GRUPO = 10;
const SE_CORTO = "Se cortó la conexión mientras se enviaba. Revisa el chat y toca enviar otra vez: lo que ya salió no se repite.";

type Props = {
  conversationId: string;
  esComentario: boolean;
  permitePrivado: boolean;
  /** Notas de voz: WhatsApp, Messenger e Instagram por mensaje directo. */
  permiteAudio: boolean;
  /** WhatsApp: el audio se convierte a nota de voz OGG/Opus antes de subirlo. */
  audioOgg: boolean;
  puede: boolean;
  aviso: string | null;
  /** Solo WhatsApp fuera de las 24 h. */
  plantillas?: PlantillaOpcion[];
  primerNombre?: string;
  /** Respuestas rápidas: {cliente} y {vendedora} se reemplazan al elegirlas. */
  respuestas?: { id: string; title: string; body: string }[];
  /** Nombre con el que se presenta quien responde. */
  vendedora?: string;
};

type Foto = { archivo: File; vista: string };

function rellenar(texto: string, cliente: string, vendedora: string) {
  // Sin nombre del cliente: "¡Hola {cliente}!" → "¡Hola!" y "gracias, {cliente}!" → "gracias!".
  return texto
    .replace(/,?\s*\{cliente\}/g, (m) => (cliente ? m.replace("{cliente}", cliente) : ""))
    .replace(/\{vendedora\}/g, vendedora || "el equipo de Almacén Yesandy")
    .replace(/^\s+/, "");
}

export function Composer({
  conversationId,
  esComentario,
  permitePrivado,
  permiteAudio,
  audioOgg,
  puede,
  aviso,
  plantillas,
  primerNombre,
  respuestas,
  vendedora,
}: Props) {
  const [texto, setTexto] = useState("");
  const [rapidas, setRapidas] = useState(false);
  const [fotos, setFotos] = useState<Foto[]>([]);
  const [grabando, setGrabando] = useState(false);
  const [subiendo, setSubiendo] = useState(false);
  const [preparando, setPreparando] = useState(false);
  const [enviandoFotos, setEnviandoFotos] = useState(false);
  const [progreso, setProgreso] = useState<string | null>(null);
  const [microfono, setMicrofono] = useState<Promise<MediaStream> | null>(null);
  const [problema, setProblema] = useState<string | null>(null);
  const [privado, setPrivado] = useState(false);
  const [idem, setIdem] = useState(() => crypto.randomUUID());
  const archivo = useRef<HTMLInputElement>(null);
  const camara = useRef<HTMLInputElement>(null);
  const area = useRef<HTMLTextAreaElement>(null);
  const ultimoEscribiendo = useRef(0);
  // Archivo ya subido → su ruta, para que un reintento no lo vuelva a subir.
  const subidos = useRef(new WeakMap<File, string>());
  // Grabación → su versión de nota de voz para WhatsApp.
  const convertidos = useRef(new WeakMap<File, File>());

  const quitarFotos = () => {
    fotos.forEach((f) => URL.revokeObjectURL(f.vista));
    setFotos([]);
    if (archivo.current) archivo.current.value = "";
  };

  const [estado, accion, pendiente] = useActionState<Estado, FormData>(async (prev, fd) => {
    let r: Estado;
    try {
      r = await enviar(conversationId, prev, fd);
    } catch (e) {
      // Sin esto, un corte de conexión a la mitad del envío tumba la página entera.
      reportarFalla(fd.get("esAudio") === "1" ? "enviar audio" : "enviar mensaje", e);
      return { ok: false, mensaje: SE_CORTO };
    }
    if (r?.ok) {
      // Se limpia lo enviado y se prepara una llave nueva contra envíos dobles.
      if (fd.get("esAudio") === "1") {
        setGrabando(false);
      } else {
        setTexto("");
        quitarFotos();
        setPrivado(false);
      }
      setIdem(crypto.randomUUID());
    }
    return r;
  }, null);

  const ocupado = pendiente || subiendo || preparando || enviandoFotos;
  const error = problema ?? (estado && !estado.ok ? estado.mensaje : null);

  // La caja crece con el texto hasta 6 líneas.
  useEffect(() => {
    const el = area.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 160)}px`;
    el.style.overflowY = el.scrollHeight > 160 ? "auto" : "hidden";
  }, [texto]);

  if (!puede) {
    return (
      <div className="max-h-[60dvh] overflow-y-auto border-t border-border bg-surface px-4 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
        <p className="rounded-lg bg-amber-500/10 px-3 py-2 text-sm text-amber-800 dark:text-amber-200">{aviso}</p>
        {plantillas && (
          <PlantillaPicker conversationId={conversationId} plantillas={plantillas} primerNombre={primerNombre ?? ""} />
        )}
      </div>
    );
  }

  /** Sube los archivos directo al almacenamiento y devuelve sus rutas (o null si algo falló). */
  async function subir(archivos: File[], tipo: "image" | "audio"): Promise<string[] | null> {
    setSubiendo(true);
    setProblema(null);
    try {
      const faltan = archivos.filter((f) => !subidos.current.has(f));
      if (faltan.length) {
        // Una por una: en iPhone procesar varias a la vez agota la memoria y recarga la página.
        const listos: File[] = [];
        if (tipo === "image") {
          for (const [i, f] of faltan.entries()) {
            try {
              listos.push(await comprimirFoto(f));
            } catch (e) {
              reportarFalla("preparar foto", e, `${f.type || "sin tipo"} ${f.name} ${f.size} bytes`);
              setProblema(`No se pudo preparar la foto ${i + 1}. Quítala y elígela de nuevo, o tómala con la cámara.`);
              return null;
            }
          }
        } else listos.push(...faltan);
        const r = await prepararSubida(
          conversationId,
          listos.map((f) => ({ tipo, mime: f.type, tamano: f.size })),
        );
        if (!r.ok) {
          setProblema(r.mensaje);
          return null;
        }
        const sb = createClient();
        // De 3 en 3: con señal débil, muchas subidas a la vez fallan todas.
        let siguiente = 0;
        await Promise.all(
          Array.from({ length: Math.min(3, r.subidas.length) }, async () => {
            while (siguiente < r.subidas.length) {
              const i = siguiente++;
              const s = r.subidas[i];
              const { error } = await sb.storage
                .from("attachments")
                .uploadToSignedUrl(s.ruta, s.token, listos[i], { contentType: listos[i].type });
              if (error) throw error;
              subidos.current.set(faltan[i], s.ruta);
            }
          }),
        );
      }
      return archivos.map((f) => subidos.current.get(f)!);
    } catch (e) {
      reportarFalla(`subir ${tipo === "image" ? "fotos" : "audio"}`, e);
      setProblema("No se pudo subir. Revisa la conexión e intenta de nuevo.");
      return null;
    } finally {
      setSubiendo(false);
    }
  }

  async function mandar() {
    if (ocupado || (!texto.trim() && !fotos.length)) return;
    if (fotos.length) return mandarFotos();
    const fd = new FormData();
    fd.set("mensaje", texto);
    fd.set("idem", idem);
    if (privado) fd.set("privado", "1");
    startTransition(() => accion(fd));
  }

  /**
   * Las fotos salen en grupos de 10 (cada grupo es un envío corto) y las que ya salieron se quitan
   * de la lista. Si algo falla, quedan solo las que faltan y se vuelve a tocar enviar.
   */
  async function mandarFotos() {
    const lista = [...fotos];
    const total = lista.length;
    let pie = texto;
    let hechas = 0;
    setEnviandoFotos(true);
    setProblema(null);
    try {
      while (hechas < total) {
        const grupo = lista.slice(hechas, hechas + GRUPO);
        setProgreso(total > GRUPO ? `enviando ${hechas + 1} a ${hechas + grupo.length} de ${total}…` : null);
        const rutas = await subir(
          grupo.map((f) => f.archivo),
          "image",
        );
        if (!rutas) return;
        const fd = new FormData();
        fd.set("mensaje", pie);
        fd.set("idem", idem);
        rutas.forEach((r) => fd.append("adjunto", r));
        const r = await enviar(conversationId, null, fd);
        const salieron = r?.ok ? grupo.length : (r?.enviadas ?? 0);
        if (salieron) {
          quitarEnviadas(grupo.slice(0, salieron));
          hechas += salieron;
          // El texto va con la primera foto: ya salió.
          if (pie) {
            pie = "";
            setTexto("");
          }
        }
        if (!r?.ok) {
          setProblema(
            hechas ? `Se enviaron ${hechas} de ${total} fotos. Toca enviar otra vez para mandar las que faltan.` : (r?.mensaje ?? "No se pudo enviar."),
          );
          return;
        }
      }
      if (archivo.current) archivo.current.value = "";
      setIdem(crypto.randomUUID());
    } catch (e) {
      reportarFalla("enviar fotos", e, `${hechas} de ${total}`);
      setProblema(SE_CORTO);
    } finally {
      setEnviandoFotos(false);
      setProgreso(null);
    }
  }

  function quitarEnviadas(enviadas: Foto[]) {
    enviadas.forEach((f) => URL.revokeObjectURL(f.vista));
    setFotos((a) => a.filter((f) => !enviadas.includes(f)));
  }

  /** El cliente ve "escribiendo…" (como máximo un aviso cada 15 s). En WhatsApp además queda leído. */
  function avisarEscribiendo() {
    if (esComentario || Date.now() - ultimoEscribiendo.current < 15_000) return;
    ultimoEscribiendo.current = Date.now();
    escribiendo(conversationId).catch(() => null);
  }

  async function mandarAudio(grabado: File) {
    if (ocupado) return;
    let audio = grabado;
    if (audioOgg) {
      // WhatsApp: nota de voz OGG/Opus; si el celular no puede crearla (iPhone con iOS viejo), MP3.
      // Se convierte una sola vez: si falla el envío, el reintento usa el mismo archivo ya subido.
      const listo = convertidos.current.get(grabado);
      if (listo) audio = listo;
      else {
        setSubiendo(true);
        try {
          audio = await prepararAudioWhatsApp(grabado);
          convertidos.current.set(grabado, audio);
        } catch (e) {
          setSubiendo(false);
          setProblema(SIN_NOTA_DE_VOZ);
          reportarFalla("convertir audio", e);
          return;
        }
      }
    }
    const rutas = await subir([audio], "audio");
    if (!rutas) return;
    const fd = new FormData();
    fd.set("mensaje", "");
    fd.set("idem", idem);
    fd.set("esAudio", "1");
    fd.append("adjunto", rutas[0]);
    startTransition(() => accion(fd));
  }

  /**
   * Cada foto se reduce apenas se elige (una por una) y la miniatura usa la versión reducida:
   * mostrar varias fotos de 12 MP del iPhone a tamaño completo agota la memoria de Safari.
   */
  async function agregarFotos(lista: FileList | null) {
    const nuevas = Array.from(lista ?? []);
    if (archivo.current) archivo.current.value = "";
    if (camara.current) camara.current.value = "";
    if (!nuevas.length) return;
    const espacio = MAX_FOTOS - fotos.length;
    setProblema(nuevas.length > espacio ? `Se pueden enviar hasta ${MAX_FOTOS} fotos a la vez.` : null);
    setPreparando(true);
    let fallidas = 0;
    try {
      for (const f of nuevas.slice(0, Math.max(0, espacio))) {
        if (!esFoto(f)) {
          fallidas++;
          reportarFalla("foto no reconocida", null, `${f.type || "sin tipo"} ${f.name} ${f.size} bytes`);
          continue;
        }
        try {
          const { archivo: lista, mini } = await prepararFoto(f);
          setFotos((a) => [...a, { archivo: lista, vista: URL.createObjectURL(mini) }]);
        } catch (e) {
          fallidas++;
          reportarFalla("preparar foto", e, `${f.type || "sin tipo"} ${f.name} ${f.size} bytes`);
        }
      }
    } finally {
      setPreparando(false);
    }
    if (fallidas) {
      setProblema(
        fallidas === 1
          ? "Una foto no se pudo preparar. Prueba elegirla de nuevo o tómala con la cámara."
          : `${fallidas} fotos no se pudieron preparar. Prueba elegirlas de nuevo o tómalas con la cámara.`,
      );
    }
  }

  function quitarFoto(i: number) {
    URL.revokeObjectURL(fotos[i].vista);
    setFotos((a) => a.filter((_, j) => j !== i));
  }

  const vacio = !texto.trim() && !fotos.length;

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        mandar();
      }}
      className="border-t border-border bg-surface px-3 pt-2 pb-[max(0.5rem,env(safe-area-inset-bottom))] md:px-4"
    >
      {aviso && <p className="mb-2 rounded-lg bg-amber-500/10 px-3 py-1.5 text-xs text-amber-800 dark:text-amber-200">{aviso}</p>}

      {esComentario && (
        <div className="mb-2 flex gap-1.5" role="radiogroup" aria-label="Cómo responder">
          {[
            { v: false, t: "Responder en público" },
            ...(permitePrivado ? [{ v: true, t: "Mensaje privado" }] : []),
          ].map((o) => (
            <button
              key={o.t}
              type="button"
              role="radio"
              aria-checked={privado === o.v}
              onClick={() => setPrivado(o.v)}
              className={`h-8 rounded-full border px-3 text-[13px] font-medium ${
                privado === o.v ? "border-accent bg-accent/10 text-accent" : "border-border text-muted"
              }`}
            >
              {o.t}
            </button>
          ))}
        </div>
      )}

      {grabando ? (
        <Grabadora
          microfono={microfono}
          enviando={ocupado}
          onGrabando={avisarEscribiendo}
          onEnviar={mandarAudio}
          onCerrar={() => {
            setGrabando(false);
            setProblema(null);
          }}
        />
      ) : (
        <>
          {rapidas && respuestas && respuestas.length > 0 && (
            <ul className="mb-2 max-h-56 overflow-y-auto rounded-xl border border-border bg-background" aria-label="Respuestas rápidas">
              {respuestas.map((r) => {
                const lista = rellenar(r.body, primerNombre ?? "", vendedora ?? "");
                return (
                  <li key={r.id} className="border-b border-border/70 last:border-b-0">
                    <button
                      type="button"
                      onClick={() => {
                        setTexto((t) => (t.trim() ? `${t.trimEnd()}\n${lista}` : lista));
                        setRapidas(false);
                        area.current?.focus();
                      }}
                      className="w-full px-3 py-2 text-left hover:bg-surface"
                    >
                      <span className="block text-sm font-medium">{r.title}</span>
                      <span className="line-clamp-2 block text-xs text-muted">{lista}</span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}

          {preparando && !fotos.length && <p className="mb-2 text-xs text-muted">Preparando fotos…</p>}
          {fotos.length > 0 && (
            <div className="mb-2">
              <ul className="flex gap-2 overflow-x-auto pb-1" aria-label="Fotos por enviar">
                {fotos.map((f, i) => (
                  <li key={f.vista} className="relative shrink-0">
                    {/* eslint-disable-next-line @next/next/no-img-element -- vista previa local */}
                    <img src={f.vista} alt={`Foto ${i + 1} por enviar`} className="h-20 w-20 rounded-lg object-cover" />
                    <button
                      type="button"
                      onClick={() => quitarFoto(i)}
                      disabled={ocupado}
                      aria-label={`Quitar foto ${i + 1}`}
                      className="absolute -top-1.5 -right-1.5 flex size-6 items-center justify-center rounded-full bg-foreground text-xs text-background shadow"
                    >
                      ✕
                    </button>
                  </li>
                ))}
                {fotos.length < MAX_FOTOS && (
                  <li className="shrink-0">
                    <button
                      type="button"
                      onClick={() => archivo.current?.click()}
                      disabled={ocupado}
                      aria-label="Agregar más fotos"
                      className="flex h-20 w-20 items-center justify-center rounded-lg border border-dashed border-border text-2xl text-muted hover:text-foreground"
                    >
                      +
                    </button>
                  </li>
                )}
              </ul>
              <p className="mt-0.5 text-xs text-muted">
                {fotos.length} {fotos.length === 1 ? "foto" : "fotos"} · cada una llega como un mensaje
                {preparando ? " · preparando…" : progreso ? ` · ${progreso}` : subiendo ? " · subiendo…" : enviandoFotos ? " · enviando…" : ""}
              </p>
            </div>
          )}

          <div className="flex items-end gap-2">
            {!esComentario && (
              <>
                <input
                  ref={archivo}
                  type="file"
                  accept="image/*"
                  multiple
                  className="hidden"
                  onChange={(e) => agregarFotos(e.target.files)}
                />
                {/* Abre la cámara del celular directamente; la foto queda en la lista para enviar. */}
                <input
                  ref={camara}
                  type="file"
                  accept="image/*"
                  capture="environment"
                  className="hidden"
                  onChange={(e) => agregarFotos(e.target.files)}
                />
                <button
                  type="button"
                  onClick={() => camara.current?.click()}
                  disabled={ocupado || fotos.length >= MAX_FOTOS}
                  aria-label="Tomar foto con la cámara"
                  className="hidden size-11 shrink-0 items-center justify-center rounded-full text-muted hover:bg-background hover:text-foreground [@media(pointer:coarse)]:flex"
                >
                  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                    <path d="M14.5 4h-5L7.5 6.5H4a1 1 0 0 0-1 1V19a1 1 0 0 0 1 1h16a1 1 0 0 0 1-1V7.5a1 1 0 0 0-1-1h-3.5L14.5 4Z" />
                    <circle cx="12" cy="13" r="3.5" />
                  </svg>
                </button>
                <button
                  type="button"
                  onClick={() => archivo.current?.click()}
                  disabled={ocupado}
                  aria-label="Adjuntar fotos"
                  className="flex size-11 shrink-0 items-center justify-center rounded-full text-muted hover:bg-background hover:text-foreground"
                >
                  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                    <rect x="3" y="3" width="18" height="18" rx="3" />
                    <circle cx="9" cy="9" r="2" />
                    <path d="m21 15-4.5-4.5L5 21" />
                  </svg>
                </button>
              </>
            )}
            {respuestas && respuestas.length > 0 && (
              <button
                type="button"
                onClick={() => setRapidas((v) => !v)}
                aria-label="Respuestas rápidas"
                aria-expanded={rapidas}
                className={`flex size-11 shrink-0 items-center justify-center rounded-full hover:bg-background ${rapidas ? "text-accent" : "text-muted hover:text-foreground"}`}
              >
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                  <path d="M13 2 3 14h9l-1 8 10-12h-9l1-8Z" />
                </svg>
              </button>
            )}
            <textarea
              ref={area}
              value={texto}
              onChange={(e) => {
                setTexto(e.target.value);
                if (e.target.value.trim()) avisarEscribiendo();
              }}
              onKeyDown={(e) => {
                // En computadora Enter envía y Shift+Enter hace salto de línea. En el celular Enter es salto de línea.
                if (e.key === "Enter" && !e.shiftKey && window.matchMedia("(pointer: fine)").matches) {
                  e.preventDefault();
                  mandar();
                }
              }}
              rows={1}
              maxLength={4000}
              placeholder={
                esComentario
                  ? privado
                    ? "Mensaje privado al cliente…"
                    : "Respuesta pública…"
                  : fotos.length
                    ? "Agrega un texto (opcional)…"
                    : "Escribe un mensaje…"
              }
              aria-label="Mensaje"
              className="max-h-40 min-h-11 flex-1 resize-none rounded-2xl border border-border bg-background px-4 py-2.5 text-base outline-none focus:border-accent"
            />
            {permiteAudio && vacio ? (
              // Sin texto ni fotos, el botón de enviar se vuelve micrófono (como en WhatsApp).
              <button
                type="button"
                onClick={() => {
                  setProblema(null);
                  // Se pide en el mismo toque: iPhone acepta mejor el permiso así.
                  let pedido: Promise<MediaStream> | null = null;
                  try {
                    pedido = pedirMicrofono();
                    pedido.catch(() => null); // el error lo muestra la grabadora
                  } catch {
                    // navegador sin micrófono: la grabadora lo explica
                  }
                  setMicrofono(pedido);
                  setGrabando(true);
                }}
                aria-label="Grabar audio"
                className="flex size-11 shrink-0 items-center justify-center rounded-full bg-accent text-accent-foreground transition"
              >
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                  <rect x="9" y="2" width="6" height="12" rx="3" />
                  <path d="M5 10a7 7 0 0 0 14 0M12 17v5" />
                </svg>
              </button>
            ) : (
              <button
                type="submit"
                disabled={ocupado || vacio}
                aria-label="Enviar"
                className="flex size-11 shrink-0 items-center justify-center rounded-full bg-accent text-accent-foreground transition disabled:opacity-40"
              >
                {ocupado ? (
                  <span className="size-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
                ) : (
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                    <path d="M22 2 11 13" />
                    <path d="M22 2 15 22l-4-9-9-4 20-7Z" />
                  </svg>
                )}
              </button>
            )}
          </div>
        </>
      )}
      {error && <p role="alert" className="mt-1.5 text-sm text-danger">{error}</p>}
    </form>
  );
}
