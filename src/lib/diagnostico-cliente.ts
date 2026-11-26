// Datos del celular para entender fallas (solo navegador): sistema, navegador, si está instalado
// como app y qué formatos soporta. No incluye mensajes ni datos de clientes.
import { guardarDiagnostico } from "@/app/(app)/avisos/diagnostico-acciones";
import { microfonoSiempreListo } from "./microfono";

export function entornoDelCelular(): Record<string, unknown> {
  const n = navigator as Navigator & { standalone?: boolean; deviceMemory?: number };
  const grabar = typeof MediaRecorder !== "undefined";
  return {
    navegador: n.userAgent,
    instalada: window.matchMedia("(display-mode: standalone)").matches || n.standalone === true,
    pantalla: `${screen.width}x${screen.height}`,
    memoriaGB: n.deviceMemory ?? null,
    grabadora: grabar,
    m4a: grabar && MediaRecorder.isTypeSupported("audio/mp4"),
    webm: grabar && MediaRecorder.isTypeSupported("audio/webm"),
    codificadorAudio: typeof AudioEncoder !== "undefined",
    microfono: Boolean(n.mediaDevices?.getUserMedia),
    createImageBitmap: typeof createImageBitmap === "function",
    microfonoListo: microfonoSiempreListo(),
  };
}

function texto(e: unknown): string {
  if (!e) return "";
  if (e instanceof Error) return `${e.name}: ${e.message}`;
  if (typeof e === "object" && "message" in e) return String((e as { message: unknown }).message);
  return String(e);
}

/** Guarda la falla para que administración la pueda revisar. No hace esperar ni falla. */
export function reportarFalla(contexto: string, error: unknown, detalle?: string) {
  try {
    guardarDiagnostico({ contexto, detalle: [texto(error), detalle].filter(Boolean).join(" · "), entorno: entornoDelCelular() }).catch(
      () => null,
    );
  } catch {
    // nada
  }
}
