"use client";

import { Suspense, useState } from "react";
import Link from "next/link";
import { signIn, getSession } from "next-auth/react";
import { useRouter, useSearchParams } from "next/navigation";

const avisosConfirmacao: Record<string, { texto: string; ok: boolean }> = {
  ok: { texto: "Email confirmado! Entre com a senha temporaria Muda@123.", ok: true },
  "ok-casal": {
    texto: "Emails de voces dois confirmados! Cada um entra com a senha temporaria Muda@123 e cria a sua.",
    ok: true,
  },
  expirada: { texto: "Link de confirmacao invalido ou expirado. Faca o cadastro novamente.", ok: false },
  invalida: { texto: "Link de confirmacao invalido.", ok: false },
};

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const aviso = avisosConfirmacao[searchParams.get("confirmacao") ?? ""];
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");
    const res = await signIn("credentials", { email, password, redirect: false });
    setLoading(false);
    if (res?.error) {
      setError(
        res.error === "EMAIL_NAO_VERIFICADO"
          ? "Confirme seu email antes de entrar (veja sua caixa de entrada)."
          : "Email ou senha invalidos."
      );
      return;
    }
    // Quem ainda esta na senha temporaria vai direto criar a definitiva.
    const session = await getSession();
    router.push(session?.user?.mustChangePassword ? "/trocar-senha" : "/dashboard");
  }

  return (
    <div className="flex min-h-screen items-center justify-center px-4">
      <form
        onSubmit={handleSubmit}
        className="w-full max-w-sm space-y-4 rounded-xl border border-slate-200 bg-white p-8 shadow-sm"
      >
        <h1 className="text-xl font-semibold text-slate-900">We Finance</h1>
        <p className="text-sm text-slate-500">Entre com sua conta para continuar.</p>

        {aviso && (
          <p
            className={`rounded-lg px-3 py-2 text-sm font-medium ${
              aviso.ok ? "bg-emerald-50 text-emerald-700" : "bg-red-50 text-red-700"
            }`}
          >
            {aviso.texto}
          </p>
        )}

        <div className="space-y-1">
          <label htmlFor="email" className="text-sm font-medium text-slate-700">Email</label>
          <input
            id="email"
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none"
          />
        </div>

        <div className="space-y-1">
          <label htmlFor="password" className="text-sm font-medium text-slate-700">Senha</label>
          <input
            id="password"
            type="password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none"
          />
        </div>

        {error && <p className="text-sm text-red-600">{error}</p>}

        <button
          type="submit"
          disabled={loading}
          className="w-full rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
        >
          {loading ? "Entrando..." : "Entrar"}
        </button>

        <p className="text-center text-sm text-slate-500">
          Nao tem conta?{" "}
          <Link href="/registrar" className="text-indigo-600 hover:underline">
            Criar conta
          </Link>
        </p>
      </form>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense>
      <LoginForm />
    </Suspense>
  );
}
