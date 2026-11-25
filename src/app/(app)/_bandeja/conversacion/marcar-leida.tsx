"use client";

import { useEffect } from "react";
import { marcarLeida } from "../acciones";

/**
 * Al abrir la conversación (y cuando llegan mensajes nuevos con ella abierta) queda leída en el CRM
 * y en la red social, aunque en el CRM ya no estuviera marcada como nueva (p. ej. si la atendió la IA).
 */
export function MarcarLeida({ id, sinLeer }: { id: string; sinLeer: number }) {
  useEffect(() => {
    if (document.visibilityState === "visible") marcarLeida(id);
  }, [id, sinLeer]);
  return null;
}
