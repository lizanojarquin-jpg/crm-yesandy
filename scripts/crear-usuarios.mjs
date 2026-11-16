// Crea (o actualiza) las cuentas del equipo en Supabase Auth.
// Uso:  npm.cmd run crear-usuarios
// Pide el PIN de cada usuario en la terminal (no se muestra ni se guarda en ningún archivo).
// Se puede volver a correr: si el usuario ya existe, le actualiza el PIN y el rol.

import readline from "node:readline";
import { createClient } from "@supabase/supabase-js";

const DOMINIO_INTERNO = "crm.yesandycr.com";
const EQUIPO = [
  { nombre: "Admin", rol: "admin" },
  { nombre: "Ventas 1", rol: "seller" },
  { nombre: "Ventas 2", rol: "seller" },
  { nombre: "Ventas 3", rol: "seller" },
  { nombre: "Ventas 4", rol: "seller" },
];

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const secret = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !secret) {
  console.error("Faltan NEXT_PUBLIC_SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY en .env.local");
  process.exit(1);
}

const normalizar = (s) =>
  s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]/g, "");
const correo = (nombre) => `${normalizar(nombre)}@${DOMINIO_INTERNO}`;

function esPinDebil(pin) {
  if (/^(\d)\1{5}$/.test(pin)) return true; // 111111
  const asc = "0123456789012", desc = "9876543210987";
  return asc.includes(pin) || desc.includes(pin); // 123456, 987654
}

function preguntarOculto(pregunta) {
  return new Promise((resolve) => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout, terminal: true });
    rl._writeToOutput = (s) => {
      if (s.startsWith(pregunta)) rl.output.write(pregunta);
      else if (s.includes("\n") || s.includes("\r")) rl.output.write("\n");
      else rl.output.write("*");
    };
    rl.question(pregunta, (r) => {
      rl.close();
      resolve(r.trim());
    });
  });
}

const supabase = createClient(url, secret, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const { data: lista, error: errLista } = await supabase.auth.admin.listUsers({ perPage: 200 });
if (errLista) {
  console.error("No se pudo conectar con Supabase:", errLista.message);
  process.exit(1);
}
const existentes = new Map(lista.users.map((u) => [u.email, u]));

console.log("\nCRM Yesandy · crear usuarios");
console.log("Escribe un PIN de 6 números distinto para cada usuario. No se muestra en pantalla.");
console.log("Deja vacío y presiona Enter para no cambiar un usuario que ya existe.\n");

const usados = new Set();
for (const miembro of EQUIPO) {
  const email = correo(miembro.nombre);
  const existe = existentes.get(email);

  let pin;
  for (;;) {
    pin = await preguntarOculto(`PIN para "${miembro.nombre}"${existe ? " (ya existe)" : ""}: `);
    if (!pin && existe) break;
    if (!/^\d{6}$/.test(pin)) { console.log("  → Deben ser exactamente 6 números."); continue; }
    if (esPinDebil(pin)) { console.log("  → Muy fácil de adivinar (repetido o en secuencia). Usa otro."); continue; }
    if (usados.has(pin)) { console.log("  → Ese PIN ya lo usaste para otro usuario."); continue; }
    const confirmacion = await preguntarOculto("  Repite el PIN: ");
    if (confirmacion !== pin) { console.log("  → No coinciden. Otra vez."); continue; }
    break;
  }
  if (pin) usados.add(pin);

  const app_metadata = { role: miembro.rol, display_name: miembro.nombre };
  if (existe) {
    const cambios = pin ? { password: pin, app_metadata } : { app_metadata };
    const { error } = await supabase.auth.admin.updateUserById(existe.id, cambios);
    console.log(error ? `  ✗ ${miembro.nombre}: ${error.message}` : `  ✓ ${miembro.nombre} actualizado`);
  } else {
    const { error } = await supabase.auth.admin.createUser({
      email,
      password: pin,
      email_confirm: true,
      app_metadata,
    });
    console.log(error ? `  ✗ ${miembro.nombre}: ${error.message}` : `  ✓ ${miembro.nombre} creado`);
  }
}

console.log("\nListo. Cada persona entra con su usuario (ej. \"Ventas 1\") y su PIN.\n");
