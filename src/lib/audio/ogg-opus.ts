// Convierte una grabación del navegador (M4A) en nota de voz de WhatsApp: OGG con Opus, mono, 48 kHz.
// Todo ocurre en el navegador con WebCodecs (Chrome, Edge y Safari actuales); no hay que instalar nada.
// WhatsApp rechaza el M4A que graba el navegador ("Media upload error 131053").
import { decodificarMono } from "./decodificar";

const TASA = 48_000;
const PRE_SKIP_POR_DEFECTO = 312; // retraso típico del codificador Opus a 48 kHz

/** ¿Este navegador puede convertir a nota de voz? */
export async function puedeConvertirAOgg(): Promise<boolean> {
  if (typeof AudioEncoder === "undefined" || typeof AudioData === "undefined") return false;
  try {
    const r = await AudioEncoder.isConfigSupported({ codec: "opus", sampleRate: TASA, numberOfChannels: 1, bitrate: 32_000 });
    return Boolean(r.supported);
  } catch {
    return false;
  }
}

// ---------- CRC de Ogg (polinomio 0x04c11db7, sin reflejar) ----------
const TABLA_CRC = (() => {
  const t = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let r = i << 24;
    for (let j = 0; j < 8; j++) r = r & 0x80000000 ? (r << 1) ^ 0x04c11db7 : r << 1;
    t[i] = r >>> 0;
  }
  return t;
})();

function crc(datos: Uint8Array): number {
  let c = 0;
  for (const b of datos) c = ((c << 8) ^ TABLA_CRC[((c >>> 24) ^ b) & 0xff]) >>> 0;
  return c >>> 0;
}

/** Una página Ogg con uno o más paquetes completos. */
function pagina(paquetes: Uint8Array[], granulo: bigint, serie: number, secuencia: number, tipo: number): Uint8Array {
  const lacing: number[] = [];
  for (const p of paquetes) {
    let n = p.length;
    while (n >= 255) {
      lacing.push(255);
      n -= 255;
    }
    lacing.push(n);
  }
  const cuerpo = paquetes.reduce((t, p) => t + p.length, 0);
  const out = new Uint8Array(27 + lacing.length + cuerpo);
  const v = new DataView(out.buffer);
  out.set([0x4f, 0x67, 0x67, 0x53]); // "OggS"
  out[4] = 0; // versión
  out[5] = tipo; // 2 = inicio, 4 = fin
  v.setBigInt64(6, granulo, true);
  v.setUint32(14, serie, true);
  v.setUint32(18, secuencia, true);
  // CRC (22-25) en cero mientras se calcula
  out[26] = lacing.length;
  out.set(lacing, 27);
  let o = 27 + lacing.length;
  for (const p of paquetes) {
    out.set(p, o);
    o += p.length;
  }
  v.setUint32(22, crc(out), true);
  return out;
}

function encabezadoOpus(preSkip: number): Uint8Array {
  const h = new Uint8Array(19);
  const v = new DataView(h.buffer);
  h.set(new TextEncoder().encode("OpusHead"));
  h[8] = 1; // versión
  h[9] = 1; // canales (mono)
  v.setUint16(10, preSkip, true);
  v.setUint32(12, TASA, true);
  v.setInt16(16, 0, true); // ganancia
  h[18] = 0; // mapa de canales
  return h;
}

function etiquetasOpus(): Uint8Array {
  const vendedor = new TextEncoder().encode("CRM Yesandy");
  const t = new Uint8Array(8 + 4 + vendedor.length + 4);
  const v = new DataView(t.buffer);
  t.set(new TextEncoder().encode("OpusTags"));
  v.setUint32(8, vendedor.length, true);
  t.set(vendedor, 12);
  v.setUint32(12 + vendedor.length, 0, true); // sin comentarios
  return t;
}

/** Convierte cualquier audio que el navegador pueda reproducir en un archivo .ogg (Opus, mono). */
export async function convertirAOgg(archivo: Blob): Promise<File> {
  // 1. Decodificar a muestras de 48 kHz y mezclar a mono.
  const mono = await decodificarMono(archivo, TASA);

  // 2. Codificar en Opus (paquetes de 20 ms).
  const paquetes: { datos: Uint8Array; duracion: number }[] = [];
  let preSkip = PRE_SKIP_POR_DEFECTO;
  let falla: unknown = null;
  const encoder = new AudioEncoder({
    output: (chunk, meta) => {
      const d = new Uint8Array(chunk.byteLength);
      chunk.copyTo(d);
      // Si el codificador entrega su propio encabezado, se usa su retraso real.
      const desc = meta?.decoderConfig?.description;
      if (desc && desc.byteLength >= 19) {
        const b = ArrayBuffer.isView(desc)
          ? new Uint8Array(desc.buffer, desc.byteOffset, desc.byteLength)
          : new Uint8Array(desc as ArrayBuffer);
        if (new TextDecoder().decode(b.subarray(0, 8)) === "OpusHead") preSkip = b[10] | (b[11] << 8);
      }
      paquetes.push({ datos: d, duracion: Math.round(((chunk.duration ?? 20_000) * TASA) / 1_000_000) });
    },
    error: (e) => {
      falla = e;
    },
  });
  encoder.configure({ codec: "opus", sampleRate: TASA, numberOfChannels: 1, bitrate: 32_000 });
  const BLOQUE = TASA; // 1 s por entrega
  for (let i = 0; i < mono.length; i += BLOQUE) {
    const trozo = mono.subarray(i, Math.min(i + BLOQUE, mono.length));
    const data = new AudioData({
      format: "f32-planar",
      sampleRate: TASA,
      numberOfFrames: trozo.length,
      numberOfChannels: 1,
      timestamp: Math.round((i / TASA) * 1_000_000),
      data: trozo.slice(),
    });
    encoder.encode(data);
    data.close();
  }
  await encoder.flush();
  encoder.close();
  if (falla || !paquetes.length) throw new Error("No se pudo convertir el audio.");

  // 3. Empaquetar en Ogg: encabezado, etiquetas y páginas de audio (~1 s cada una).
  const serie = (Math.random() * 0xffffffff) >>> 0;
  const cero = BigInt(0);
  const paginas: Uint8Array[] = [pagina([encabezadoOpus(preSkip)], cero, serie, 0, 2), pagina([etiquetasOpus()], cero, serie, 1, 0)];
  let secuencia = 2;
  let granulo = BigInt(preSkip);
  const total = BigInt(preSkip + mono.length);
  for (let i = 0; i < paquetes.length; i += 50) {
    const grupo = paquetes.slice(i, i + 50);
    for (const p of grupo) granulo += BigInt(p.duracion);
    const ultima = i + 50 >= paquetes.length;
    // En la última página, la posición marca el final real (recorta el relleno del último paquete).
    paginas.push(pagina(grupo.map((p) => p.datos), ultima && total < granulo ? total : granulo, serie, secuencia++, ultima ? 4 : 0));
  }
  return new File(paginas as BlobPart[], "audio.ogg", { type: "audio/ogg" });
}
