// Transcribe las notas de voz que todavía no tienen texto (de los últimos N días; 3 por defecto).
// Uso: npx.cmd --yes tsx --conditions=react-server --env-file=.env.local scripts/transcribir-audios.mts [días]
import { createAdminClient } from "../src/lib/supabase/admin";
import { transcribirAudiosDeMensaje } from "../src/lib/ia/transcribir";

const dias = Number(process.argv[2] ?? 3);
const desde = new Date(Date.now() - dias * 86400e3).toISOString();
const { data } = await createAdminClient()
  .from("attachments")
  .select("message_id")
  .eq("type", "audio")
  .is("transcript", null)
  .not("storage_path", "is", null)
  .gte("created_at", desde)
  .limit(500);
const mensajes = [...new Set((data ?? []).map((a) => a.message_id))];
console.log(`Audios sin transcribir desde hace ${dias} días: ${mensajes.length}`);
let ok = 0;
for (const id of mensajes) {
  try {
    const t = await transcribirAudiosDeMensaje(id);
    if (t.length) ok++;
  } catch (e) {
    console.log("error", id, e instanceof Error ? e.message.slice(0, 120) : e);
  }
}
console.log(`Transcritos: ${ok}`);
