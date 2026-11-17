"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

/** Escucha mensajes y conversaciones nuevas (Supabase Realtime, con RLS) y refresca la pantalla. */
export function TiempoReal() {
  const router = useRouter();

  useEffect(() => {
    const sb = createClient();
    let t: ReturnType<typeof setTimeout> | undefined;
    const refrescar = () => {
      clearTimeout(t);
      t = setTimeout(() => router.refresh(), 350);
    };
    const canal = sb
      .channel("bandeja")
      .on("postgres_changes", { event: "*", schema: "public", table: "conversations" }, refrescar)
      .on("postgres_changes", { event: "*", schema: "public", table: "messages" }, refrescar)
      .subscribe();
    // Al volver a la app (celular bloqueado, otra pestaña) se pone al día.
    const alVolver = () => document.visibilityState === "visible" && refrescar();
    document.addEventListener("visibilitychange", alVolver);
    return () => {
      clearTimeout(t);
      document.removeEventListener("visibilitychange", alVolver);
      sb.removeChannel(canal);
    };
  }, [router]);

  return null;
}
