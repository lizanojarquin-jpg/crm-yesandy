"use client";

import { useActionState, useId, useState } from "react";
import { crearPlantilla, type EstadoPlantilla } from "./plantillas-actions";
import { Button } from "@/components/ui/button";

const campo = "h-11 w-full rounded-lg border border-border bg-surface px-3 text-base outline-none focus:border-accent";

export function NuevaPlantillaForm() {
  const id = useId();
  const [texto, setTexto] = useState("");
  const [estado, accion, pendiente] = useActionState<EstadoPlantilla, FormData>(async (prev, fd) => {
    const r = await crearPlantilla(prev, fd);
    if (r?.ok) setTexto("");
    return r;
  }, null);
  const nums = [...texto.matchAll(/\{\{(\d+)\}\}/g)].map((m) => Number(m[1]));
  const variables = nums.length ? Math.max(...nums) : 0;

  return (
    <form action={accion} className="flex flex-col gap-3" key={estado?.ok ? estado.n : "f"}>
      <p className="font-medium">Nueva plantilla</p>
      <div className="flex flex-col gap-1.5">
        <label htmlFor={`${id}-t`} className="text-sm font-medium">Nombre (para reconocerla)</label>
        <input id={`${id}-t`} name="titulo" required maxLength={60} placeholder="Ej. Pedido enviado" className={campo} />
      </div>
      <div className="flex flex-col gap-1.5">
        <label htmlFor={`${id}-c`} className="text-sm font-medium">Tipo</label>
        <select id={`${id}-c`} name="categoria" className={campo} defaultValue="UTILITY">
          <option value="UTILITY">Utilidad: pedidos, pagos, envíos, seguimiento</option>
          <option value="MARKETING">Marketing: ofertas y novedades</option>
        </select>
      </div>
      <div className="flex flex-col gap-1.5">
        <label htmlFor={`${id}-x`} className="text-sm font-medium">Texto</label>
        <textarea
          id={`${id}-x`}
          name="texto"
          required
          rows={4}
          maxLength={1024}
          value={texto}
          onChange={(e) => setTexto(e.target.value)}
          placeholder="Hola {{1}}, tu pedido de Almacén Yesandy ya va en camino. Número de guía: {{2}}."
          className="rounded-lg border border-border bg-surface px-3 py-2 text-base outline-none focus:border-accent"
        />
        <p className="text-xs text-muted">
          Usa {"{{1}}"}, {"{{2}}"}… para los datos que cambian (el {"{{1}}"} suele ser el nombre). No empieces ni termines con un dato.
        </p>
      </div>
      {Array.from({ length: variables }, (_, i) => (
        <div key={i} className="flex flex-col gap-1.5">
          <label htmlFor={`${id}-e${i}`} className="text-sm font-medium">
            Ejemplo para {`{{${i + 1}}}`}
          </label>
          <input id={`${id}-e${i}`} name="ejemplo" required maxLength={100} placeholder={i === 0 ? "Ana" : "Ejemplo"} className={campo} />
        </div>
      ))}
      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" disabled={pendiente}>
          {pendiente ? "Enviando…" : "Enviar a revisión de Meta"}
        </Button>
        {estado && <p className={`text-sm ${estado.ok ? "text-muted" : "text-danger"}`}>{estado.mensaje}</p>}
      </div>
    </form>
  );
}
