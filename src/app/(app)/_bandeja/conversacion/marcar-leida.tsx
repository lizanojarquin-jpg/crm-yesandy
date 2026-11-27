"use client";

import { useEffect } from "react";
import { marcarLeida } from "../acciones";

/**
 * Al abrir la conversación (y cuando llegan mensajes nuevos con ella abierta) queda leída en el CRM
 * y en la red social, aunque en el CRM ya no estuviera marcada como nueva (p. ej. si la atendió la IA).
 */
export function MarcarLeida({ id, sinLeer }: { id: string; sinLeer: number }) {
  useEffect(() => {
    // Sin señal no pasa nada: se marca la próxima vez.
    if (document.visibilityState === "visible") marcarLeida(id).catch(() => null);
  }, [id, sinLeer]);
  return null;
}
