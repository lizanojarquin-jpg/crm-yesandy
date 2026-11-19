import { getUsuarioActual } from "@/lib/auth";
import { Card } from "@/components/ui/card";
import { GestorAvisos } from "./gestor";

export const metadata = { title: "Avisos · CRM Yesandy" };

export default async function AvisosPage() {
  await getUsuarioActual();
  return (
    <div className="mx-auto max-w-xl px-4 py-6">
      <h1 className="text-xl font-semibold">Avisos en el celular</h1>
      <p className="text-sm text-muted">
        Se activan en cada dispositivo por separado (tu celular, la computadora de la tienda…). Te llegan aunque el CRM esté cerrado.
      </p>
      <Card className="mt-4">
        <GestorAvisos />
      </Card>
      <Card className="mt-4 flex flex-col gap-1.5 text-sm">
        <p className="font-medium">Qué avisa</p>
        <ul className="list-disc space-y-1 pl-5 text-muted">
          <li>
            Mensajes y comentarios nuevos de clientes. Si la conversación tiene a alguien asignado, solo le llega a esa persona; si no, a todo
            el equipo.
          </li>
          <li>Cuando la asesora IA pasa un cliente a vendedora (mientras la IA atiende, no avisa cada mensaje).</li>
          <li>Cuando la IA detecta un comprobante de pago.</li>
        </ul>
      </Card>
    </div>
  );
}
