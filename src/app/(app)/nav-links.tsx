"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const ITEMS = [
  { href: "/", label: "Bandeja", icono: IconoBandeja, soloAdmin: false },
  { href: "/seguimiento", label: "Seguimiento", icono: IconoSeguimiento, soloAdmin: false },
  { href: "/entrenar", label: "Entrenar IA", icono: IconoEntrenar, soloAdmin: false },
  { href: "/configuracion", label: "Configuración", icono: IconoAjustes, soloAdmin: true },
];

export function NavLinks({
  esAdmin,
  variante,
}: {
  esAdmin: boolean;
  variante: "lateral" | "inferior";
}) {
  const path = usePathname();
  const items = ITEMS.filter((i) => !i.soloAdmin || esAdmin);

  return items.map(({ href, label, icono: Icono }) => {
    const activo = href === "/" ? path === "/" : path.startsWith(href);
    if (variante === "inferior") {
      return (
        <Link
          key={href}
          href={href}
          aria-current={activo ? "page" : undefined}
          className={`flex flex-1 flex-col items-center gap-1 py-2.5 text-[11px] font-medium ${activo ? "text-accent" : "text-muted"}`}
        >
          <Icono />
          {label}
        </Link>
      );
    }
    return (
      <Link
        key={href}
        href={href}
        aria-current={activo ? "page" : undefined}
        className={`flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium ${activo ? "bg-accent/10 text-accent" : "text-muted hover:bg-background hover:text-foreground"}`}
      >
        <Icono />
        {label}
      </Link>
    );
  });
}

const svg = {
  width: 20,
  height: 20,
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.8,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
  "aria-hidden": true,
};

function IconoBandeja() {
  return (
    <svg {...svg}>
      <path d="M21 12a8 8 0 0 1-11.6 7.1L4 20l1-4.6A8 8 0 1 1 21 12Z" />
    </svg>
  );
}
function IconoSeguimiento() {
  return (
    <svg {...svg}>
      <path d="M9 11l3 3 8-8" />
      <path d="M20 12v7a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h9" />
    </svg>
  );
}
function IconoEntrenar() {
  return (
    <svg {...svg}>
      <path d="M12 3l1.8 4.6L18.5 9l-4.7 1.5L12 15l-1.8-4.5L5.5 9l4.7-1.4L12 3Z" />
      <path d="M18 15l.8 2.2L21 18l-2.2.8L18 21l-.8-2.2L15 18l2.2-.8L18 15Z" />
    </svg>
  );
}
function IconoAjustes() {
  return (
    <svg {...svg}>
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1Z" />
    </svg>
  );
}
