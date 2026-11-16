import { getUsuarioActual } from "@/lib/auth";
import { cerrarSesion } from "@/app/actions";
import { NavLinks } from "./nav-links";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const usuario = await getUsuarioActual();

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
        <form action={cerrarSesion}>
          <button className="text-sm text-muted" aria-label="Cerrar sesión">
            {usuario.nombre} · Salir
          </button>
        </form>
      </header>

      <main className="flex-1 pb-20 md:pb-0">{children}</main>

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
      <form action={cerrarSesion} className="mt-3">
        <button className="text-sm text-muted hover:text-foreground">Cerrar sesión</button>
      </form>
    </div>
  );
}
