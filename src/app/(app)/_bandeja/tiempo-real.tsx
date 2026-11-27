"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

/**
 * Escucha mensajes y conversaciones nuevas (Supabase Realtime, con RLS) y refresca la pantalla.
 * En el celular la señal se corta seguido: sin internet no se refresca (un refresco cortado a la
 * mitad tumbaba la pantalla del chat) y se pone al día apenas vuelve la conexión.
 */
export function TiempoReal() {
  const router = useRouter();

  useEffect(() => {
    const sb = createClient();
    let t: ReturnType<typeof setTimeout> | undefined;
    let pendiente = false;
    const refrescar = (espera = 350) => {
      clearTimeout(t);
      if (!navigator.onLine) {
        pendiente = true;
        return;
      }
      t = setTimeout(() => {
        pendiente = false;
        if (navigator.onLine && document.visibilityState === "visible") router.refresh();
        else pendiente = true;
      }, espera);
    };
    const canal = sb
      .channel("bandeja")
      .on("postgres_changes", { event: "*", schema: "public", table: "conversations" }, () => refrescar())
      .on("postgres_changes", { event: "*", schema: "public", table: "messages" }, () => refrescar())
      .subscribe();
    // Al volver a la app (celular bloqueado, otra app) se pone al día, dando un momento a que
    // el celular recupere la internet (justo al volver suele fallar la primera conexión).
    const alVolver = () => document.visibilityState === "visible" && refrescar(1200);
    const alConectar = () => pendiente && refrescar(800);
    document.addEventListener("visibilitychange", alVolver);
    window.addEventListener("online", alConectar);
    return () => {
      clearTimeout(t);
      document.removeEventListener("visibilitychange", alVolver);
      window.removeEventListener("online", alConectar);
      sb.removeChannel(canal);
    };
  }, [router]);

  return null;
}
