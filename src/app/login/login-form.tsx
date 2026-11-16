"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { correoInterno, esPinValido, normalizarUsuario } from "@/lib/usuarios";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Card } from "@/components/ui/card";

// El inicio de sesión se hace desde el navegador para que el límite de
// intentos de Supabase se aplique por dispositivo y no al servidor completo.
export function LoginForm() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [cargando, setCargando] = useState(false);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const form = new FormData(e.currentTarget);
    const usuario = String(form.get("usuario") ?? "");
    const pin = String(form.get("pin") ?? "");

    if (!normalizarUsuario(usuario)) return setError("Escribe tu usuario.");
    if (!esPinValido(pin)) return setError("El PIN tiene 6 números.");

    setCargando(true);
    const supabase = createClient();
    const { error } = await supabase.auth.signInWithPassword({
      email: correoInterno(usuario),
      password: pin,
    });

    if (error) {
      setCargando(false);
      setError(
        error.status === 429
          ? "Demasiados intentos. Espera unos minutos."
          : "Usuario o PIN incorrecto.",
      );
      return;
    }
    router.replace("/");
    router.refresh();
  }

  return (
    <Card className="p-6">
      <form onSubmit={onSubmit} className="flex flex-col gap-4" noValidate>
        <Field
          label="Usuario"
          id="usuario"
          name="usuario"
          placeholder="Ej. Ventas 1"
          autoComplete="username"
          autoCapitalize="words"
          required
        />
        <Field
          label="PIN"
          id="pin"
          name="pin"
          type="password"
          inputMode="numeric"
          pattern="\d{6}"
          maxLength={6}
          placeholder="••••••"
          autoComplete="current-password"
          required
          className="tracking-[0.4em]"
        />
        {error && (
          <p role="alert" className="text-sm text-danger">
            {error}
          </p>
        )}
        <Button type="submit" disabled={cargando} className="mt-2 w-full">
          {cargando ? "Entrando…" : "Entrar"}
        </Button>
      </form>
    </Card>
  );
}
