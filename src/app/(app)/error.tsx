"use client";

import { useEffect, useState } from "react";
import { reportarFalla } from "@/lib/diagnostico-cliente";

const texto = (e: unknown) => (e instanceof Error ? `${e.name}: ${e.message}` : String(e));
/** Cortes de internet (Android: "network error"; iPhone: "Load failed"; otros: "Failed to fetch"). */
const esCorteDeRed = (e: unknown) => /network ?error|load failed|failed to fetch|fetch failed|networkerror|connection/i.test(texto(e));

// Reintentos seguidos de un corte de red (se reinicia si pasó más de un minuto del último).
const MAX_REINTENTOS = 6;
let reintentos = 0;
let ultimo = 0;

/**
 * Si una pantalla falla:
 * - Corte de internet: se reintenta solo (y apenas vuelve la conexión) sin perder el chat.
 * - Otro error, o la red no vuelve: se guarda el detalle para administración y se ofrece reintentar.
 */
export default function ErrorPantalla({ error, retry }: { error: unknown; retry: () => void }) {
  const red = esCorteDeRed(error);
  const [rendido, setRendido] = useState(false);

  useEffect(() => {
    const pila = error instanceof Error ? (error.stack ?? "").split("\n").slice(0, 4).join(" | ") : "";
    const reportar = () => reportarFalla("pantalla con error", error, `${location.pathname} · ${pila}`.slice(0, 900));
    if (!red) {
      reportar();
      return;
    }
    if (Date.now() - ultimo > 60_000) reintentos = 0;
    ultimo = Date.now();
    if (reintentos >= MAX_REINTENTOS) {
      reportar();
      // eslint-disable-next-line react-hooks/set-state-in-effect -- se rinde después de varios intentos
      setRendido(true);
      return;
    }
    const intentar = () => {
      reintentos++;
      retry();
    };
    // Con internet: reintenta en un momento. Sin internet: espera a que vuelva.
    const t = navigator.onLine ? setTimeout(intentar, 1500 * (reintentos + 1)) : undefined;
    const alConectar = () => {
      clearTimeout(t);
      intentar();
    };
    window.addEventListener("online", alConectar, { once: true });
    return () => {
      clearTimeout(t);
      window.removeEventListener("online", alConectar);
    };
  }, [error, red, retry]);

  if (red && !rendido) {
    return (
      <div className="mx-auto flex max-w-md flex-col items-center gap-3 px-4 py-16 text-center" role="status">
        <span className="size-6 animate-spin rounded-full border-2 border-accent border-t-transparent" aria-hidden />
        <p className="font-semibold">Se cortó la internet. Reconectando…</p>
        <p className="text-sm text-muted">El chat vuelve solo apenas haya señal. No hace falta hacer nada.</p>
      </div>
    );
  }

  return (
    <div className="mx-auto flex max-w-md flex-col items-center gap-3 px-4 py-16 text-center">
      <p className="text-lg font-semibold">{red ? "No hay conexión a internet" : "Algo falló en esta pantalla"}</p>
      <p className="text-sm text-muted">
        {red
          ? "Revisa el wifi o los datos del celular y toca Reintentar."
          : "Ya le llegó el detalle a administración. Lo que ya se envió quedó enviado; revisa el chat antes de mandarlo otra vez."}
      </p>
      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => {
            reintentos = 0;
            setRendido(false);
            retry();
          }}
          className="h-10 rounded-lg bg-accent px-4 text-sm font-medium text-accent-foreground"
        >
          Reintentar
        </button>
        <button type="button" onClick={() => location.reload()} className="h-10 rounded-lg border border-border px-4 text-sm">
          Recargar
        </button>
      </div>
    </div>
  );
}
