// Registra (o actualiza) el webhook "CRM Yesandy" de Zernio con la dirección de producción
// y manda un evento de prueba. Úsalo si cambia el dominio del CRM.
// Uso: npx.cmd --yes tsx --conditions=react-server --env-file=.env.local scripts/activar-webhook.mts https://crm.yesandycr.com
import { registerWebhook, sendTestWebhook } from "../src/lib/zernio/client";

const base = (process.argv[2] ?? "").replace(/\/$/, "");
if (!base.startsWith("https://")) {
  console.error("Pasa la dirección pública del CRM, por ejemplo https://crm.yesandycr.com");
  process.exit(1);
}
const w = await registerWebhook(`${base}/api/webhooks/zernio`);
console.log("Webhook:", w.url, "· activo:", w.isActive);
await sendTestWebhook(w._id);
console.log("Evento de prueba enviado.");
