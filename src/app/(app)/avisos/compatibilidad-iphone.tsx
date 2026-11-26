"use client";

import { useEffect, useState } from "react";
import { cambiarMicrofonoSiempreListo, esIphone, esIphoneInstalado, microfonoSiempreListo, pedirMicrofono } from "@/lib/microfono";
import { reportarFalla } from "@/lib/diagnostico-cliente";

/**
 * iPhone: el CRM en la pantalla de inicio no guarda el permiso del micrófono ni de la cámara.
 * Dos salidas: dejar el micrófono listo mientras la app está abierta, o trabajar desde Safari,
 * donde el permiso sí se puede dejar en "Permitir" para siempre.
 */
export function CompatibilidadIphone() {
  const [listo, setListo] = useState(false);
  const [entorno, setEntorno] = useState<{ iphone: boolean; instalada: boolean } | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);

  useEffect(() => {
    // Solo se sabe en el navegador (localStorage y tipo de celular).
    // eslint-disable-next-line react-hooks/set-state-in-effect -- lectura única al abrir
    setListo(microfonoSiempreListo());
    setEntorno({ iphone: esIphone(), instalada: esIphoneInstalado() });
  }, []);

  async function cambiar(activo: boolean) {
    cambiarMicrofonoSiempreListo(activo);
    setListo(activo);
    setAviso(null);
    if (!activo) return;
    // Se pide ya, en este toque, para que el primer audio no tenga que preguntar.
    try {
      await pedirMicrofono();
      setAviso("Listo: el micrófono queda abierto mientras uses el CRM. Si iPhone vuelve a preguntar al abrir la app, toca Permitir.");
    } catch (e) {
      reportarFalla("máxima compatibilidad", e);
      setAviso("iPhone no dio permiso. Cierra el CRM por completo (desliza hacia arriba y quítalo), ábrelo y vuelve a activar esto tocando Permitir.");
    }
  }

  return (
    <div id="iphone" className="flex scroll-mt-20 flex-col gap-3 text-sm">
      <div>
        <p className="font-medium">iPhone: máxima compatibilidad</p>
        <p className="text-muted">
          Cuando el CRM está en la pantalla de inicio, iPhone no guarda el permiso del micrófono: lo vuelve a pedir cada vez que la app se
          reabre, y si alguien toca «No permitir» queda bloqueado hasta cerrarla.
        </p>
      </div>

      <label className="flex items-start gap-3 rounded-lg border border-border p-3">
        <input type="checkbox" checked={listo} onChange={(e) => cambiar(e.target.checked)} className="mt-0.5 size-5 shrink-0 accent-accent" />
        <span>
          <span className="block font-medium">Mantener el micrófono listo en este celular</span>
          <span className="block text-muted">
            Pregunta una sola vez cada vez que abres el CRM, no en cada audio. Mientras esté abierto verás el punto naranja de iPhone: es
            normal, no se graba nada hasta que tocas el micrófono.
          </span>
        </span>
      </label>
      {aviso && (
        <p role="status" className="text-muted">
          {aviso}
        </p>
      )}

      <div className="rounded-lg bg-background p-3">
        <p className="font-medium">Sin preguntas nunca: usar el CRM desde Safari</p>
        <ol className="mt-1 list-decimal space-y-1 pl-5 text-muted">
          <li>
            Abre <b>crm.yesandycr.com</b> en Safari
            {entorno?.instalada && (
              <>
                {" "}
                (
                <a href="x-safari-https://crm.yesandycr.com/" className="font-medium text-accent underline">
                  abrir en Safari
                </a>
                )
              </>
            )}{" "}
            y entra con tu usuario.
          </li>
          <li>
            Toca <b>aA</b> junto a la dirección → <b>Ajustes del sitio web</b>.
          </li>
          <li>
            Micrófono → <b>Permitir</b>. Cámara → <b>Permitir</b>.
          </li>
          <li>Trabaja desde esa pestaña de Safari. Los avisos siguen llegando al ícono de la pantalla de inicio.</li>
        </ol>
      </div>

      {entorno && !entorno.iphone && <p className="text-xs text-muted">Este celular no es iPhone: no hace falta activar nada.</p>}
      <p className="text-xs text-muted">
        También ayuda: Ajustes → General → Actualización de software, para tener la versión más reciente.
      </p>
    </div>
  );
}
