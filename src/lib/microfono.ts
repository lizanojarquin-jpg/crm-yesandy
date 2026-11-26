// Micrófono para las notas de voz (solo navegador).
//
// En iPhone, cuando el CRM está en la pantalla de inicio, el permiso no se guarda: iPhone vuelve a
// preguntar cada vez que la app se reabre (y la cierra seguido para ahorrar memoria). Si alguien toca
// "No permitir" una vez, el micrófono queda bloqueado hasta cerrar la app por completo.
//
// "Máxima compatibilidad" (por celular): el micrófono se abre una vez y se usa para todos los audios
// mientras la app esté abierta, así iPhone pregunta una sola vez por apertura y no en cada audio.

const CLAVE = "yesandy-microfono-listo";
const OPCIONES: MediaStreamConstraints = { audio: { echoCancellation: true, noiseSuppression: true } };

let flujo: MediaStream | null = null;
let pidiendo: Promise<MediaStream> | null = null;

/** Este celular tiene activada la máxima compatibilidad. */
export function microfonoSiempreListo(): boolean {
  try {
    return localStorage.getItem(CLAVE) === "1";
  } catch {
    return false;
  }
}

export function cambiarMicrofonoSiempreListo(activo: boolean) {
  try {
    if (activo) localStorage.setItem(CLAVE, "1");
    else localStorage.removeItem(CLAVE);
  } catch {
    // modo privado: queda solo para esta vez
  }
  if (!activo) cerrarMicrofono();
}

const sirve = (s: MediaStream | null) => Boolean(s?.getAudioTracks().some((t) => t.readyState === "live" && !t.muted));

/**
 * Pide el micrófono. Llamarlo directo en el toque del botón (no después): iPhone acepta mejor el
 * permiso así. Si ya hay uno abierto y funcionando, se reusa sin volver a preguntar.
 */
export function pedirMicrofono(): Promise<MediaStream> {
  if (sirve(flujo)) return Promise.resolve(flujo!);
  if (pidiendo) return pidiendo;
  cerrarMicrofono();
  pidiendo = navigator.mediaDevices
    .getUserMedia(OPCIONES)
    .then((s) => {
      flujo = s;
      return s;
    })
    .finally(() => {
      pidiendo = null;
    });
  return pidiendo;
}

/** Terminó una grabación: se apaga el micrófono, salvo en máxima compatibilidad. */
export function soltarMicrofono() {
  if (!microfonoSiempreListo()) cerrarMicrofono();
}

export function cerrarMicrofono() {
  flujo?.getTracks().forEach((t) => t.stop());
  flujo = null;
}

/** iPhone o iPad con el CRM abierto desde la pantalla de inicio (no en Safari). */
export function esIphoneInstalado(): boolean {
  if (!esIphone()) return false;
  return (navigator as Navigator & { standalone?: boolean }).standalone === true || window.matchMedia("(display-mode: standalone)").matches;
}

export function esIphone(): boolean {
  if (typeof navigator === "undefined") return false;
  return /iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
}
