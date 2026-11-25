"use client";

import { useEffect, useRef, useState } from "react";
import { reportarFalla } from "@/lib/diagnostico-cliente";

/** Máximo de una grabación. */
const MAX_SEGUNDOS = 180;
/** M4A (AAC): lo aceptan WhatsApp, Messenger e Instagram. Lo graban Chrome, Edge y Safari actuales. */
const FORMATOS = ["audio/mp4;codecs=mp4a.40.2", "audio/mp4"];

function formatoAudio(): string | null {
  if (typeof MediaRecorder === "undefined" || !navigator.mediaDevices?.getUserMedia) return null;
  return FORMATOS.find((t) => MediaRecorder.isTypeSupported(t)) ?? null;
}

const reloj = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;

type Fase = "pidiendo" | "grabando" | "lista" | "sinSoporte" | "sinPermiso";

/** Graba una nota de voz, la deja escuchar y la envía. Se monta al tocar el micrófono. */
export function Grabadora({
  enviando,
  onGrabando,
  onEnviar,
  onCerrar,
}: {
  enviando: boolean;
  /** Se llama mientras graba (para el "escribiendo…" del cliente). */
  onGrabando?: () => void;
  onEnviar: (archivo: File) => void;
  onCerrar: () => void;
}) {
  const [formato] = useState(() => {
    const f = formatoAudio();
    if (!f) reportarFalla("grabar audio", null, "el navegador no graba M4A");
    return f;
  });
  const [fase, setFase] = useState<Fase>(formato ? "pidiendo" : "sinSoporte");
  const [segundos, setSegundos] = useState(0);
  const [audio, setAudio] = useState<{ archivo: File; url: string } | null>(null);
  const grabador = useRef<MediaRecorder | null>(null);
  const flujo = useRef<MediaStream | null>(null);
  const descartar = useRef(false);
  const avisar = useRef(onGrabando);
  useEffect(() => {
    avisar.current = onGrabando;
  }, [onGrabando]);

  const soltarMicrofono = () => {
    flujo.current?.getTracks().forEach((t) => t.stop());
    flujo.current = null;
  };

  // Empieza a grabar apenas se abre.
  useEffect(() => {
    if (!formato) return;
    let vivo = true;
    descartar.current = false;
    navigator.mediaDevices
      .getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } })
      .then((s) => {
        if (!vivo) return s.getTracks().forEach((t) => t.stop());
        flujo.current = s;
        const partes: Blob[] = [];
        const r = new MediaRecorder(s, { mimeType: formato, audioBitsPerSecond: 64_000 });
        r.ondataavailable = (e) => e.data.size && partes.push(e.data);
        r.onstop = () => {
          soltarMicrofono();
          if (descartar.current || !vivo) return;
          const archivo = new File([new Blob(partes, { type: "audio/mp4" })], "audio.m4a", { type: "audio/mp4" });
          setAudio({ archivo, url: URL.createObjectURL(archivo) });
          setFase("lista");
        };
        r.start(1000);
        grabador.current = r;
        setFase("grabando");
      })
      .catch((e) => {
        reportarFalla("abrir micrófono", e);
        if (vivo) setFase("sinPermiso");
      });
    return () => {
      vivo = false;
      descartar.current = true;
      if (grabador.current?.state === "recording") grabador.current.stop();
      soltarMicrofono();
    };
  }, [formato]);

  // Contador y corte automático a los 3 minutos.
  useEffect(() => {
    if (fase !== "grabando") return;
    avisar.current?.();
    const t = setInterval(() => {
      avisar.current?.();
      setSegundos((s) => {
        if (s + 1 >= MAX_SEGUNDOS && grabador.current?.state === "recording") grabador.current.stop();
        return s + 1;
      });
    }, 1000);
    return () => clearInterval(t);
  }, [fase]);

  useEffect(() => () => {
    if (audio) URL.revokeObjectURL(audio.url);
  }, [audio]);

  const cancelar = () => {
    descartar.current = true;
    if (grabador.current?.state === "recording") grabador.current.stop();
    soltarMicrofono();
    onCerrar();
  };

  const botonCerrar = (
    <button
      type="button"
      onClick={cancelar}
      disabled={enviando}
      aria-label="Borrar audio"
      className="flex size-11 shrink-0 items-center justify-center rounded-full text-muted hover:bg-background hover:text-danger disabled:opacity-40"
    >
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        <path d="M3 6h18M8 6V4h8v2m-9 0 1 14h8l1-14" />
      </svg>
    </button>
  );

  if (fase === "sinSoporte" || fase === "sinPermiso") {
    return (
      <div className="flex items-center gap-2">
        <p role="alert" className="flex-1 text-sm text-danger">
          {fase === "sinSoporte"
            ? "Este navegador no puede grabar audios. Usa Chrome o Safari actualizados."
            : "No hay permiso para el micrófono. En iPhone: Ajustes → Apps → Safari → Micrófono → Permitir. En Android: toca el candado junto a la dirección → Permisos → Micrófono."}
        </p>
        <button type="button" onClick={onCerrar} className="h-9 rounded-lg border border-border px-3 text-sm">
          Cerrar
        </button>
      </div>
    );
  }

  if (fase === "lista" && audio) {
    return (
      <div className="flex items-center gap-2">
        {botonCerrar}
        <audio controls src={audio.url} className="h-11 min-w-0 flex-1" />
        <button
          type="button"
          onClick={() => onEnviar(audio.archivo)}
          disabled={enviando}
          aria-label="Enviar audio"
          className="flex size-11 shrink-0 items-center justify-center rounded-full bg-accent text-accent-foreground transition disabled:opacity-40"
        >
          {enviando ? (
            <span className="size-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
          ) : (
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <path d="M22 2 11 13" />
              <path d="M22 2 15 22l-4-9-9-4 20-7Z" />
            </svg>
          )}
        </button>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-2">
      {botonCerrar}
      <div className="flex h-11 flex-1 items-center gap-2 rounded-2xl border border-border bg-background px-4" aria-live="polite">
        <span className={`size-2.5 rounded-full bg-danger ${fase === "grabando" ? "animate-pulse" : "opacity-40"}`} aria-hidden />
        <span className="text-sm tabular-nums">{fase === "grabando" ? `Grabando ${reloj(segundos)}` : "Abriendo el micrófono…"}</span>
        <span className="ml-auto text-xs text-muted">máx. {reloj(MAX_SEGUNDOS)}</span>
      </div>
      <button
        type="button"
        onClick={() => grabador.current?.state === "recording" && grabador.current.stop()}
        disabled={fase !== "grabando"}
        aria-label="Terminar de grabar"
        className="flex size-11 shrink-0 items-center justify-center rounded-full bg-danger text-white transition disabled:opacity-40"
      >
        <span className="size-3.5 rounded-sm bg-current" aria-hidden />
      </button>
    </div>
  );
}
