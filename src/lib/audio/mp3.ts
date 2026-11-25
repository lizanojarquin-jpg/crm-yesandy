// Respaldo para WhatsApp en celulares que no pueden crear notas de voz OGG/Opus (p. ej. iPhone
// con iOS anterior a 26): el audio se convierte a MP3, que WhatsApp también acepta (llega como
// audio, no como nota de voz). El codificador se carga solo cuando hace falta.
import { decodificarMono } from "./decodificar";

const TASA = 44_100;

export async function convertirAMp3(archivo: Blob): Promise<File> {
  const mono = await decodificarMono(archivo, TASA);
  const { Mp3Encoder } = await import("@breezystack/lamejs");
  const enc = new Mp3Encoder(1, TASA, 64);
  const partes: Uint8Array[] = [];
  const BLOQUE = 1152 * 20;
  const pcm = new Int16Array(BLOQUE);
  for (let i = 0; i < mono.length; i += BLOQUE) {
    const n = Math.min(BLOQUE, mono.length - i);
    for (let j = 0; j < n; j++) {
      const s = Math.max(-1, Math.min(1, mono[i + j]));
      pcm[j] = s < 0 ? s * 0x8000 : s * 0x7fff;
    }
    const salida = enc.encodeBuffer(pcm.subarray(0, n));
    if (salida.length) partes.push(new Uint8Array(salida));
  }
  const final = enc.flush();
  if (final.length) partes.push(new Uint8Array(final));
  if (!partes.length) throw new Error("No se pudo convertir el audio a MP3.");
  return new File(partes as BlobPart[], "audio.mp3", { type: "audio/mpeg" });
}
