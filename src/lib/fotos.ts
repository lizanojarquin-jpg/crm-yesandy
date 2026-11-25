// Preparar fotos del celular antes de enviarlas (solo navegador).
// En iPhone: las fotos pueden venir en HEIC, a veces sin tipo, y Safari se queda sin memoria si se
// procesan varias de 12 MP a la vez (la página se recarga y parece que "se borró todo").
// Por eso: se aceptan por extensión, se procesan una por una y se libera la memoria de cada una.

const LADO_MAXIMO = 1600;
/** Fotos ya reducidas: no se vuelven a comprimir al enviar (perderían calidad). */
const listas = new WeakSet<File>();

/** Es una foto aunque el navegador no diga el tipo (pasa con HEIC en iPhone). */
export function esFoto(f: File): boolean {
  return f.type.startsWith("image/") || /\.(jpe?g|png|heic|heif|webp)$/i.test(f.name);
}

type Imagen = { fuente: CanvasImageSource; ancho: number; alto: number; liberar: () => void };

async function decodificar(f: File): Promise<Imagen> {
  if (typeof createImageBitmap === "function") {
    try {
      const b = await createImageBitmap(f);
      return { fuente: b, ancho: b.width, alto: b.height, liberar: () => b.close() };
    } catch {
      // Safari viejo no decodifica HEIC con createImageBitmap; se intenta con una imagen normal.
    }
  }
  const url = URL.createObjectURL(f);
  try {
    const img = new Image();
    img.src = url;
    await img.decode();
    return { fuente: img, ancho: img.naturalWidth, alto: img.naturalHeight, liberar: () => URL.revokeObjectURL(url) };
  } catch (e) {
    URL.revokeObjectURL(url);
    throw e;
  }
}

/** JPEG de hasta 1600 px. Las fotos JPG livianas se envían tal cual. */
export async function comprimirFoto(f: File): Promise<File> {
  if (listas.has(f) || (f.type === "image/jpeg" && f.size < 400_000)) return f;
  const img = await decodificar(f);
  const canvas = document.createElement("canvas");
  try {
    const escala = Math.min(1, LADO_MAXIMO / Math.max(img.ancho, img.alto));
    canvas.width = Math.max(1, Math.round(img.ancho * escala));
    canvas.height = Math.max(1, Math.round(img.alto * escala));
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("sin canvas");
    ctx.drawImage(img.fuente, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, "image/jpeg", 0.82));
    if (!blob) throw new Error("no se pudo crear el JPEG");
    const lista = new File([blob], "foto.jpg", { type: "image/jpeg" });
    listas.add(lista);
    return lista;
  } finally {
    img.liberar();
    // En iOS la memoria del canvas no se libera sola hasta mucho después.
    canvas.width = 0;
    canvas.height = 0;
  }
}
