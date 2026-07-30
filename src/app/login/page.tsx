"use client";

import { Suspense, useState } from "react";
import Link from "next/link";
import { signIn, getSession } from "next-auth/react";
import { useRouter, useSearchParams } from "next/navigation";

const avisosConfirmacao: Record<string, { texto: string; ok: boolean }> = {
  ok: { texto: "Email confirmado! Entre com a senha temporaria Muda@123.", ok: true },
  "ok-casal": {
    texto: "Emails de vocês dois confirmados! Cada um entra com a senha temporaria Muda@123 e cria a sua.",
    ok: true,
  },
  expirada: { texto: "Link de confirmação inválido ou expirado. Faca o cadastro novamente.", ok: false },
  invalida: { texto: "Link de confirmação inválido.", ok: false },
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
          : res.error === "MUITAS_TENTATIVAS"
          ? "Muitas tentativas. Aguarde 15 minutos e tente de novo."
          : "E-mail ou senha inválidos."
      );
      return;
    }
    const session = await getSession();
    router.push(session?.user?.mustChangePassword ? "/trocar-senha" : "/dashboard");
  }

  return (
    <div className="w-full max-w-sm animate-rise">
      <h2 className="font-serif text-3xl text-ink">Bem-vindos de volta</h2>
      <p className="mt-1 text-sm text-sage">Entre para ver as contas de vocês.</p>

      {aviso && (
        <p
          className={`mt-5 rounded-xl px-4 py-3 text-sm font-medium ${
            aviso.ok ? "bg-pine/8 text-pine" : "bg-clay/10 text-clay"
          }`}
        >
          {aviso.texto}
        </p>
      )}

      <form onSubmit={handleSubmit} className="mt-6 space-y-4">
        <div className="space-y-1.5">
          <label htmlFor="email" className="eyebrow">Email</label>
          <input
            id="email"
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="input"
          />
        </div>

        <div className="space-y-1.5">
          <div className="flex items-baseline justify-between">
            <label htmlFor="password" className="eyebrow">Senha</label>
            <Link href="/esqueci-senha" className="link-honey text-xs">
              Esqueci minha senha
            </Link>
          </div>
          <input
            id="password"
            type="password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="input"
          />
        </div>

        {error && <p className="text-sm font-medium text-clay">{error}</p>}

        <button type="submit" disabled={loading} className="btn-primary w-full">
          {loading ? "Entrando..." : "Entrar"}
        </button>
      </form>

      <p className="mt-6 text-center text-sm text-sage">
        Ainda não tem conta?{" "}
        <Link href="/registrar" className="link-honey">
          Criar a de vocês
        </Link>
      </p>
    </div>
  );
}

export default function LoginPage() {
  return (
    <div className="grid min-h-dvh lg:grid-cols-[1.05fr_1fr]">
      <BrandPanel />
      <div className="flex items-center justify-center px-6 py-14">
        <Suspense>
          <LoginForm />
        </Suspense>
      </div>
    </div>
  );
}

// Painel da marca: verde-pinho, wordmark e a proposta. So aparece inteiro no
// desktop; no celular vira uma faixa curta no topo.
function BrandPanel() {
  return (
    <div className="relative flex flex-col justify-between overflow-hidden bg-pine px-6 py-10 text-cream lg:px-12 lg:py-14">
      <div
        aria-hidden
        className="pointer-events-none absolute -right-24 -top-24 h-96 w-96 rounded-full"
        style={{ background: "radial-gradient(circle, rgba(231,183,90,0.16), transparent 70%)" }}
      />
      <Link href="/" className="flex items-baseline gap-1.5 leading-none">
        <span className="font-serif text-3xl italic text-honey-soft">We</span>
        <span className="font-serif text-3xl">Finance</span>
      </Link>

      <div className="relative hidden max-w-md lg:block">
        <p className="eyebrow text-honey-soft/80">Finanças a dois</p>
        <p className="mt-4 font-serif text-4xl leading-tight">
          As contas <span className="italic text-honey-soft">da casa</span>, as suas e as dele
          &mdash; no mesmo lugar, em paz.
        </p>
        <p className="mt-5 text-sm leading-relaxed text-cream/70">
          Casa, Pessoal e PJ separados com clareza. Cada um enxerga o conjunto,
          sem planilha perdida no WhatsApp.
        </p>
      </div>

      <p className="relative hidden text-xs text-cream/40 lg:block">
        Seus dados são privados da sua casa. Só vocês dois enxergam.
      </p>
    </div>
  );
}
