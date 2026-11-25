"use client";

import { useRef, useState } from "react";
import { convertirAOgg, puedeConvertirAOgg } from "@/lib/audio/ogg-opus";
import { convertirAMp3 } from "@/lib/audio/mp3";
import { comprimirFoto } from "@/lib/fotos";
import { entornoDelCelular } from "@/lib/diagnostico-cliente";
import { guardarDiagnostico } from "./diagnostico-acciones";

type Fila = { texto: string; ok: boolean | null };

const kb = (n: number) => `${Math.round(n / 1024)} KB`;
const error = (e: unknown) => (e instanceof Error ? `${e.name}: ${e.message}` : String(e));

/** Prueba en este celular lo que hace falta para mandar audios y fotos, y guarda el resultado. */
export function RevisarCelular() {
  const [filas, setFilas] = useState<Fila[]>([]);
  const [ocupado, setOcupado] = useState(false);
  const foto = useRef<HTMLInputElement>(null);

  const agregar = (f: Fila) => setFilas((a) => [...a, f]);
  const guardar = (contexto: string, detalle: string) =>
    guardarDiagnostico({ contexto, detalle, entorno: entornoDelCelular() }).catch(() => null);

  async function revisar() {
    setOcupado(true);
    const e = entornoDelCelular();
    const ogg = await puedeConvertirAOgg();
    const lista: Fila[] = [
      { texto: `Instalado como app: ${e.instalada ? "sí" : "no (en el navegador)"}`, ok: null },
      { texto: "Micrófono disponible", ok: Boolean(e.microfono) },
      { texto: "Graba audio (M4A) — Messenger e Instagram", ok: Boolean(e.m4a) },
      { texto: ogg ? "Nota de voz para WhatsApp" : "Nota de voz para WhatsApp: no, se usa MP3 de respaldo", ok: ogg ? true : null },
      { texto: "Prepara fotos", ok: Boolean(e.createImageBitmap) },
    ];
    setFilas(lista);
    await guardar("revisión", lista.map((f) => `${f.ok === false ? "✗" : f.ok ? "✓" : "·"} ${f.texto}`).join(" | "));
    setOcupado(false);
  }

  async function probarMicrofono() {
    setOcupado(true);
    let flujo: MediaStream | null = null;
    try {
      flujo = await navigator.mediaDevices.getUserMedia({ audio: true });
      const tipo = ["audio/mp4;codecs=mp4a.40.2", "audio/mp4"].find((t) => MediaRecorder.isTypeSupported(t));
      if (!tipo) throw new Error("no graba M4A");
      const r = new MediaRecorder(flujo, { mimeType: tipo });
      const partes: Blob[] = [];
      r.ondataavailable = (ev) => ev.data.size && partes.push(ev.data);
      const fin = new Promise((ok) => (r.onstop = ok));
      agregar({ texto: "Grabando 3 segundos… habla algo", ok: null });
      r.start(1000);
      await new Promise((ok) => setTimeout(ok, 3000));
      r.stop();
      await fin;
      const m4a = new Blob(partes, { type: "audio/mp4" });
      agregar({ texto: `Grabación: ${kb(m4a.size)}`, ok: m4a.size > 0 });
      let resultado: string;
      try {
        const ogg = (await puedeConvertirAOgg()) ? await convertirAOgg(m4a) : null;
        resultado = ogg ? `Nota de voz WhatsApp (OGG): ${kb(ogg.size)}` : `WhatsApp en MP3: ${kb((await convertirAMp3(m4a)).size)}`;
        agregar({ texto: resultado, ok: true });
      } catch (e) {
        const mp3 = await convertirAMp3(m4a);
        resultado = `OGG falló (${error(e)}); MP3: ${kb(mp3.size)}`;
        agregar({ texto: resultado, ok: true });
      }
      await guardar("prueba micrófono", `ok · ${resultado}`);
    } catch (e) {
      agregar({ texto: `Micrófono: ${error(e)}`, ok: false });
      await guardar("prueba micrófono", `falla · ${error(e)}`);
    } finally {
      flujo?.getTracks().forEach((t) => t.stop());
      setOcupado(false);
    }
  }

  async function probarFoto(f: File | undefined) {
    if (foto.current) foto.current.value = "";
    if (!f) return;
    setOcupado(true);
    const original = `${f.type || "sin tipo"} · ${f.name} · ${kb(f.size)}`;
    try {
      const lista = await comprimirFoto(f);
      agregar({ texto: `Foto lista: ${kb(lista.size)} (original ${original})`, ok: true });
      await guardar("prueba foto", `ok · ${kb(lista.size)} · original ${original}`);
    } catch (e) {
      agregar({ texto: `Foto: ${error(e)} (original ${original})`, ok: false });
      await guardar("prueba foto", `falla · ${error(e)} · original ${original}`);
    } finally {
      setOcupado(false);
    }
  }

  return (
    <div className="flex flex-col gap-3 text-sm">
      <div>
        <p className="font-medium">Revisar este celular</p>
        <p className="text-muted">Si no puedes mandar audios o fotos, toca estos botones. El resultado le llega a administración.</p>
      </div>
      <div className="flex flex-wrap gap-2">
        <button type="button" onClick={revisar} disabled={ocupado} className="h-9 rounded-lg border border-border px-3 disabled:opacity-50">
          1. Revisar
        </button>
        <button type="button" onClick={probarMicrofono} disabled={ocupado} className="h-9 rounded-lg border border-border px-3 disabled:opacity-50">
          2. Probar micrófono
        </button>
        <button type="button" onClick={() => foto.current?.click()} disabled={ocupado} className="h-9 rounded-lg border border-border px-3 disabled:opacity-50">
          3. Probar una foto
        </button>
        <input ref={foto} type="file" accept="image/*" className="hidden" onChange={(e) => probarFoto(e.target.files?.[0])} />
      </div>
      {filas.length > 0 && (
        <ul className="space-y-1" aria-live="polite">
          {filas.map((f, i) => (
            <li key={i} className={f.ok === false ? "text-danger" : f.ok ? "text-foreground" : "text-muted"}>
              {f.ok === false ? "✗" : f.ok ? "✓" : "·"} {f.texto}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
