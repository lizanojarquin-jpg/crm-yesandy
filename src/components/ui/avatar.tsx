import { iniciales, plataforma, type Plataforma } from "@/lib/inbox/etiquetas";

/** Iniciales del contacto con la marca del canal en la esquina. */
export function Avatar({ nombre, canal, tamano = "md" }: { nombre: string; canal?: Plataforma; tamano?: "md" | "lg" }) {
  const p = canal ? plataforma(canal) : null;
  const caja = tamano === "lg" ? "size-14 text-lg" : "size-11 text-sm";
  return (
    <div className="relative shrink-0">
      <div className={`${caja} flex items-center justify-center rounded-full bg-accent/12 font-semibold text-accent`}>
        {iniciales(nombre)}
      </div>
      {p && <CanalPunto canal={p.valor} className="absolute -right-0.5 -bottom-0.5 ring-2 ring-surface" />}
    </div>
  );
}

export function CanalPunto({ canal, className = "" }: { canal: Plataforma; className?: string }) {
  const p = plataforma(canal);
  return (
    <span
      title={p.texto}
      className={`inline-flex size-[18px] items-center justify-center rounded-full text-[8px] font-bold leading-none text-white ${className}`}
      style={{ backgroundColor: p.color }}
    >
      {p.corto}
    </span>
  );
}
