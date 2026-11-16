import { LoginForm } from "./login-form";

export const metadata = { title: "Entrar · CRM Yesandy" };

export default function LoginPage() {
  return (
    <main className="flex flex-1 items-center justify-center px-4 py-10">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-accent">
            Almacén Yesandy
          </p>
          <h1 className="mt-2 text-2xl font-semibold">Entrar al CRM</h1>
        </div>
        <LoginForm />
      </div>
    </main>
  );
}
