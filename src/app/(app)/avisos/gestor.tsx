"use client";

import Link from "next/link";
import { useEffect, useState, useSyncExternalStore } from "react";
import { avisoDePrueba, guardarSuscripcion, quitarSuscripcion } from "./acciones";

const CLAVE = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? "";

function aBytes(base64: string) {
  const relleno = "=".repeat((4 - (base64.length % 4)) % 4);
  const b = atob((base64 + relleno).replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from(b, (c) => c.charCodeAt(0));
}

type Entorno = { soporta: boolean; ios: boolean; instalada: boolean; permiso: NotificationPermission | "no"; franjaCerrada: boolean };

function leerEntorno(): Entorno {
  const ios = /iPad|iPhone|iPod/.test(navigator.userAgent);
  const instalada =
    window.matchMedia("(display-mode: standalone)").matches || (navigator as unknown as { standalone?: boolean }).standalone === true;
  const soporta = "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
  let franjaCerrada = false;
  try {
    franjaCerrada = localStorage.getItem("avisos-franja") === "cerrada";
  } catch {}
  return { soporta, ios, instalada, permiso: soporta ? Notification.permission : "no", franjaCerrada };
}

// El entorno solo existe en el navegador; en el servidor no se muestra nada.
const SIN_SOPORTE: Entorno = { soporta: false, ios: false, instalada: false, permiso: "no", franjaCerrada: true };
let cache: Entorno | null = null;
const suscriptores = new Set<() => void>();
function refrescarEntorno() {
  cache = leerEntorno();
  suscriptores.forEach((f) => f());
}
function useEntorno() {
  return useSyncExternalStore(
    (f) => {
      suscriptores.add(f);
      return () => suscriptores.delete(f);
    },
    () => (cache ??= leerEntorno()),
    () => SIN_SOPORTE,
  );
}

async function registro() {
  return navigator.serviceWorker.register("/sw.js", { scope: "/", updateViaCache: "none" });
}

/** Registra el service worker y, si faltan los avisos en este dispositivo, muestra una franja para activarlos. */
export function FranjaAvisos() {
  const e = useEntorno();

  useEffect(() => {
    if ("serviceWorker" in navigator) registro().catch(() => null);
  }, []);

  if (e.franjaCerrada || !CLAVE) return null;
  const falta = (e.ios && !e.instalada) || (e.soporta && e.permiso === "default");
  if (!falta) return null;

  return (
    <div className="flex items-center gap-3 border-b border-border bg-accent/10 px-4 py-2 text-sm">
      <span aria-hidden>🔔</span>
      <p className="flex-1">
        {e.ios && !e.instalada ? "Instala el CRM en tu iPhone para recibir avisos de mensajes nuevos." : "Activa los avisos para enterarte de los mensajes nuevos."}
      </p>
      <Link href="/avisos" className="font-medium text-accent">
        {e.ios && !e.instalada ? "Cómo" : "Activar"}
      </Link>
      <button
        type="button"
        aria-label="Cerrar aviso"
        className="text-muted"
        onClick={() => {
          try {
            localStorage.setItem("avisos-franja", "cerrada");
          } catch {}
          refrescarEntorno();
        }}
      >
        ✕
      </button>
    </div>
  );
}

/** Pantalla "Avisos": activar, probar o apagar los avisos en este dispositivo. */
export function GestorAvisos() {
  const e = useEntorno();
  const [suscrito, setSuscrito] = useState<boolean | null>(null);
  const [trabajando, setTrabajando] = useState(false);
  const [mensaje, setMensaje] = useState<string | null>(null);

  useEffect(() => {
    if (!e.soporta) return;
    registro()
      .then((r) => r.pushManager.getSubscription())
      .then((s) => setSuscrito(Boolean(s)))
      .catch(() => setSuscrito(false));
  }, [e.soporta]);

  const activar = async () => {
    setTrabajando(true);
    setMensaje(null);
    try {
      const permiso = await Notification.requestPermission();
      refrescarEntorno();
      if (permiso !== "granted") {
        setMensaje("No se dio permiso. Puedes activarlo en los ajustes del navegador para este sitio.");
        return;
      }
      const r = await registro();
      await navigator.serviceWorker.ready;
      const s = (await r.pushManager.getSubscription()) ?? (await r.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: aBytes(CLAVE) }));
      const res = await guardarSuscripcion(JSON.parse(JSON.stringify(s)), navigator.userAgent);
      if (!res.ok) throw new Error();
      setSuscrito(true);
      const p = await avisoDePrueba();
      setMensaje(p.enviados ? "Listo. Te mandamos un aviso de prueba." : "Activado, pero el aviso de prueba no salió. Intenta de nuevo.");
    } catch {
      setMensaje("No se pudieron activar los avisos en este dispositivo.");
    } finally {
      setTrabajando(false);
    }
  };

  const apagar = async () => {
    setTrabajando(true);
    try {
      const r = await registro();
      const s = await r.pushManager.getSubscription();
      if (s) {
        await quitarSuscripcion(s.endpoint);
        await s.unsubscribe();
      }
      setSuscrito(false);
      setMensaje("Avisos apagados en este dispositivo.");
    } finally {
      setTrabajando(false);
    }
  };

  const probar = async () => {
    setTrabajando(true);
    const p = await avisoDePrueba().finally(() => setTrabajando(false));
    setMensaje(p.enviados ? "Aviso de prueba enviado." : "No hay dispositivos activos para tu usuario.");
  };

  if (e.ios && !e.instalada) {
    return (
      <div className="flex flex-col gap-3 text-sm">
        <p>En iPhone los avisos solo funcionan con el CRM instalado en la pantalla de inicio:</p>
        <ol className="list-decimal space-y-1 pl-5">
          <li>Abre crm.yesandycr.com en <b>Safari</b>.</li>
          <li>
            Toca el botón <b>Compartir</b> (el cuadrado con la flecha hacia arriba).
          </li>
          <li>
            Elige <b>Agregar a pantalla de inicio</b> y luego <b>Agregar</b>.
          </li>
          <li>Abre el CRM desde el ícono nuevo, entra y vuelve a esta pantalla para activar los avisos.</li>
        </ol>
        <p className="text-xs text-muted">Necesita iOS 16.4 o más reciente.</p>
      </div>
    );
  }

  if (!e.soporta) {
    return <p className="text-sm text-muted">Este navegador no permite avisos. Prueba con Chrome, Edge o Safari actualizados.</p>;
  }

  return (
    <div className="flex flex-col gap-3">
      {e.permiso === "denied" ? (
        <p className="text-sm text-danger">
          Los avisos están bloqueados para este sitio. Actívalos en los ajustes del navegador (el candado junto a la dirección) y recarga.
        </p>
      ) : suscrito ? (
        <>
          <p className="text-sm">✅ Este dispositivo recibe avisos.</p>
          <div className="flex flex-wrap gap-2">
            <button onClick={probar} disabled={trabajando} className="h-10 rounded-lg bg-accent px-4 text-sm font-medium text-accent-foreground disabled:opacity-50">
              Mandar aviso de prueba
            </button>
            <button onClick={apagar} disabled={trabajando} className="h-10 rounded-lg border border-border px-4 text-sm font-medium disabled:opacity-50">
              Apagar en este dispositivo
            </button>
          </div>
        </>
      ) : (
        <button
          onClick={activar}
          disabled={trabajando || suscrito === null}
          className="h-11 self-start rounded-lg bg-accent px-4 text-sm font-medium text-accent-foreground disabled:opacity-50"
        >
          {trabajando ? "Activando…" : "Activar avisos en este dispositivo"}
        </button>
      )}
      {mensaje && (
        <p role="status" className="text-sm text-muted">
          {mensaje}
        </p>
      )}
    </div>
  );
}
