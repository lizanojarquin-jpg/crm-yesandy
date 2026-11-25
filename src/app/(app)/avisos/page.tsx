import Link from "next/link";
import { getUsuarioActual } from "@/lib/auth";
import { Card } from "@/components/ui/card";
import { GestorAvisos } from "./gestor";
import { RevisarCelular } from "./revisar-celular";

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
      <Card className="mt-4 flex items-center justify-between gap-3 text-sm">
        <p>Nombre con el que te presentas a los clientes</p>
        <Link href="/bienvenida" className="shrink-0 font-medium text-accent">
          Cambiar
        </Link>
      </Card>
      <Card className="mt-4">
        <RevisarCelular />
      </Card>
      <Card className="mt-4 flex flex-col gap-1.5 text-sm">
        <p className="font-medium">Permisos en iPhone (para que no los pida cada vez)</p>
        <ul className="list-disc space-y-1 pl-5 text-muted">
          <li>Ajustes → Apps → Safari → Micrófono → <b>Permitir</b>. Lo mismo en Cámara.</li>
          <li>
            O dentro de Safari, con el CRM abierto: toca <b>aA</b> junto a la dirección → Ajustes del sitio web → Micrófono y Cámara →{" "}
            <b>Permitir</b>.
          </li>
          <li>Si el CRM está en la pantalla de inicio, iPhone puede volver a preguntar al abrirlo: es normal, toca Permitir.</li>
          <li>Actualiza el iPhone (Ajustes → General → Actualización de software) para tener la nota de voz de WhatsApp.</li>
        </ul>
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
