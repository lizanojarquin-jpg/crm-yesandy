/** Decodifica una grabación (M4A, WAV…) a muestras mono a la frecuencia pedida. Solo navegador. */
export async function decodificarMono(archivo: Blob, tasa: number): Promise<Float32Array> {
  const Contexto =
    window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  const ctx = new Contexto({ sampleRate: tasa });
  try {
    const datos = await archivo.arrayBuffer();
    // Safari viejo solo tiene la forma con callbacks.
    const buf = await new Promise<AudioBuffer>((ok, mal) => {
      const p = ctx.decodeAudioData(datos, ok, mal);
      if (p && typeof p.then === "function") p.then(ok, mal);
    });
    const mono = new Float32Array(buf.length);
    for (let c = 0; c < buf.numberOfChannels; c++) {
      const canal = buf.getChannelData(c);
      for (let i = 0; i < canal.length; i++) mono[i] += canal[i] / buf.numberOfChannels;
    }
    return mono;
  } finally {
    ctx.close().catch(() => null);
  }
}
