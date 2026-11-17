"use client";

import { useEffect } from "react";
import { marcarLeida } from "../acciones";

/** Al tener la conversación abierta, los mensajes nuevos quedan como leídos. */
export function MarcarLeida({ id, sinLeer }: { id: string; sinLeer: number }) {
  useEffect(() => {
    if (sinLeer > 0 && document.visibilityState === "visible") marcarLeida(id);
  }, [id, sinLeer]);
  return null;
}
