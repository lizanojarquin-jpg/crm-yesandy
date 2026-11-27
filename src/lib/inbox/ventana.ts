import type { Plataforma } from "./etiquetas";

export type Ventana = { puede: boolean; etiquetaAgente: boolean; aviso: string | null };

const HORA = 3_600_000;

/**
 * Reglas de Meta para mensajes directos:
 * - WhatsApp: texto libre hasta 24 h después del último mensaje del cliente; después, solo plantillas.
 * - Facebook e Instagram: libre 24 h; hasta 7 días como respuesta de una persona (etiqueta HUMAN_AGENT).
 */
export function ventanaMensajes(platform: Plataforma, ultimoEntrante: string | null, ahora = Date.now()): Ventana {
  const horas = ultimoEntrante ? (ahora - new Date(ultimoEntrante).getTime()) / HORA : Infinity;
  if (horas < 24) return { puede: true, etiquetaAgente: false, aviso: null };

  if (platform === "whatsapp") {
    return {
      puede: false,
      etiquetaAgente: false,
      aviso:
        "Pasaron más de 24 horas desde el último mensaje del cliente: WhatsApp no deja escribir texto libre desde el CRM. Usa una plantilla aprobada (abajo) o escríbele desde la app WhatsApp Business del celular; lo que mandes ahí también aparece aquí. Cuando el cliente responda, se vuelve a abrir.",
    };
  }
  if ((platform === "facebook" || platform === "instagram") && horas < 24 * 7) {
    return {
      puede: true,
      etiquetaAgente: true,
      aviso: "Pasaron más de 24 horas: el mensaje sale como respuesta de una persona del equipo (Meta lo permite hasta 7 días).",
    };
  }
  return {
    puede: false,
    etiquetaAgente: false,
    aviso: "Pasaron más de 7 días desde el último mensaje del cliente. Meta no deja escribir hasta que el cliente vuelva a escribir.",
  };
}
