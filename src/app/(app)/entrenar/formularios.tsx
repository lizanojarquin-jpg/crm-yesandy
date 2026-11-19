"use client";

import { useActionState, useId } from "react";
import { crearLeccion, crearTema, editarLeccion, guardarTema, type Estado } from "./acciones";

const caja = "rounded-lg border border-border bg-surface px-3 py-2 text-sm outline-none focus:border-accent";
const boton = "h-9 rounded-lg bg-accent px-3 text-sm font-medium text-accent-foreground disabled:opacity-50";

function Aviso({ estado }: { estado: Estado }) {
  if (!estado) return null;
  return (
    <span role={estado.ok ? "status" : "alert"} className={`text-xs ${estado.ok ? "text-muted" : "text-danger"}`}>
      {estado.mensaje}
    </span>
  );
}

export function NuevaReglaForm({ esAdmin }: { esAdmin: boolean }) {
  const id = useId();
  const [estado, accion, pendiente] = useActionState<Estado, FormData>(crearLeccion, null);
  return (
    <form action={accion} key={estado?.ok ? estado.n : "f"} className="flex flex-col gap-2">
      <input type="hidden" name="kind" value="regla" />
      <label htmlFor={`${id}-c`} className="text-sm font-medium">
        Nueva regla
      </label>
      <textarea
        id={`${id}-c`}
        name="content"
        required
        rows={2}
        maxLength={2000}
        className={caja}
        placeholder='Ej. "Siempre trata al cliente de usted" o "En diciembre ofrece también las pijamas navideñas"'
      />
      <input name="reason" maxLength={500} className={`${caja} h-10`} placeholder="Por qué (opcional)" aria-label="Por qué (opcional)" />
      <div className="flex flex-wrap items-center gap-3">
        <button disabled={pendiente} className={boton}>
          {pendiente ? "Guardando…" : esAdmin ? "Guardar regla" : "Proponer regla"}
        </button>
        <Aviso estado={estado} />
      </div>
    </form>
  );
}

export function EditarLeccionForm({ id, content, reason }: { id: string; content: string; reason: string | null }) {
  const uid = useId();
  const [estado, accion, pendiente] = useActionState<Estado, FormData>(editarLeccion.bind(null, id), null);
  return (
    <form action={accion} className="mt-2 flex flex-col gap-2">
      <label htmlFor={`${uid}-c`} className="sr-only">
        Texto
      </label>
      <textarea id={`${uid}-c`} name="content" defaultValue={content} required rows={3} maxLength={2000} className={caja} />
      <input name="reason" defaultValue={reason ?? ""} maxLength={500} className={`${caja} h-10`} placeholder="Por qué (opcional)" aria-label="Por qué" />
      <div className="flex items-center gap-3">
        <button disabled={pendiente} className={boton}>
          {pendiente ? "Guardando…" : "Guardar cambios"}
        </button>
        <Aviso estado={estado} />
      </div>
    </form>
  );
}

export function TemaForm({ clave, titulo, contenido }: { clave: string; titulo: string; contenido: string }) {
  const id = useId();
  const [estado, accion, pendiente] = useActionState<Estado, FormData>(guardarTema.bind(null, clave), null);
  return (
    <form action={accion} className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-sm font-medium">
        {titulo}
      </label>
      <textarea id={id} name="contenido" rows={3} maxLength={2000} defaultValue={contenido} className={caja} />
      <div className="flex items-center gap-3">
        <button disabled={pendiente} className="text-sm font-medium text-accent disabled:opacity-50">
          {pendiente ? "Guardando…" : "Guardar"}
        </button>
        <Aviso estado={estado} />
      </div>
    </form>
  );
}

export function NuevoTemaForm() {
  const id = useId();
  const [estado, accion, pendiente] = useActionState<Estado, FormData>(crearTema, null);
  return (
    <form action={accion} key={estado?.ok ? estado.n : "f"} className="flex flex-col gap-2">
      <p className="text-sm font-medium">Agregar un tema</p>
      <label htmlFor={`${id}-t`} className="sr-only">
        Título
      </label>
      <input id={`${id}-t`} name="titulo" required maxLength={80} className={`${caja} h-10`} placeholder="Ej. Cambios y devoluciones" />
      <label htmlFor={`${id}-c`} className="sr-only">
        Información
      </label>
      <textarea
        id={`${id}-c`}
        name="contenido"
        required
        rows={3}
        maxLength={2000}
        className={caja}
        placeholder="Ej. Se puede cambiar dentro de 8 días con la factura y sin quitarle las etiquetas."
      />
      <div className="flex items-center gap-3">
        <button disabled={pendiente} className={boton}>
          {pendiente ? "Guardando…" : "Agregar tema"}
        </button>
        <Aviso estado={estado} />
      </div>
    </form>
  );
}
