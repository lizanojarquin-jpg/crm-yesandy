import { getUsuarioActual } from "@/lib/auth";
import { cerrarSesion } from "@/app/actions";
import Link from "next/link";
import { redirect } from "next/navigation";
import { nombreConfirmado } from "@/lib/nombre-cliente";
import { NavLinks } from "./nav-links";
import { FranjaAvisos } from "./avisos/gestor";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const usuario = await getUsuarioActual();
  // Ventas confirma al entrar con qué nombre se presenta a los clientes.
  if (usuario.rol !== "admin" && !(await nombreConfirmado(usuario.id))) redirect("/bienvenida");

  return (
    <div className="flex min-h-dvh flex-col md:flex-row">
      {/* Barra lateral en escritorio */}
      <aside className="hidden w-60 shrink-0 flex-col border-r border-border bg-surface md:flex">
        <div className="px-5 py-5">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-accent">Yesandy</p>
          <p className="text-sm text-muted">CRM</p>
        </div>
        <nav className="flex flex-1 flex-col gap-1 px-3">
          <NavLinks esAdmin={usuario.rol === "admin"} variante="lateral" />
        </nav>
        <UsuarioPie nombre={usuario.nombre} rol={usuario.rol} />
      </aside>

      {/* Encabezado en celular */}
      <header className="sticky top-0 z-10 flex items-center justify-between border-b border-border bg-surface/95 px-4 py-3 backdrop-blur md:hidden">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-accent">Yesandy</p>
        <div className="flex items-center gap-3">
          <Link href="/avisos" aria-label="Avisos" className="text-muted">
            <IconoCampana />
          </Link>
          <form action={cerrarSesion}>
            <button className="text-sm text-muted" aria-label="Cerrar sesión">
              {usuario.nombre} · Salir
            </button>
          </form>
        </div>
      </header>

      <main className="flex-1 pb-20 md:pb-0">
        <FranjaAvisos />
        {children}
      </main>

      {/* Menú inferior en celular */}
      <nav className="fixed inset-x-0 bottom-0 z-10 flex border-t border-border bg-surface pb-[env(safe-area-inset-bottom)] md:hidden">
        <NavLinks esAdmin={usuario.rol === "admin"} variante="inferior" />
      </nav>
    </div>
  );
}

function UsuarioPie({ nombre, rol }: { nombre: string; rol: string }) {
  return (
    <div className="border-t border-border px-5 py-4">
      <p className="text-sm font-medium">{nombre}</p>
      <p className="text-xs text-muted">{rol === "admin" ? "Administrador" : "Vendedora"}</p>
      <Link href="/bienvenida" className="mt-3 block text-sm text-muted hover:text-foreground">
        Mi nombre para clientes
      </Link>
      <Link href="/avisos" className="mt-2 flex items-center gap-2 text-sm text-muted hover:text-foreground">
        <IconoCampana /> Avisos
      </Link>
      <form action={cerrarSesion} className="mt-2">
        <button className="text-sm text-muted hover:text-foreground">Cerrar sesión</button>
      </form>
    </div>
  );
}

function IconoCampana() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M6 8a6 6 0 1 1 12 0c0 7 3 9 3 9H3s3-2 3-9" />
      <path d="M10.3 21a1.9 1.9 0 0 0 3.4 0" />
    </svg>
  );
}
