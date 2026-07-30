"use client";

import { useState } from "react";
import Link from "next/link";
import { postJson, mensagemDeErro } from "@/lib/http";

export default function EsqueciSenhaPage() {
  const [email, setEmail] = useState("");
  const [enviado, setEnviado] = useState("");
  const [erro, setErro] = useState("");
  const [enviando, setEnviando] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (enviando) return;
    setEnviando(true);
    setErro("");
    try {
      const res = await postJson<{ message: string }>("/api/auth/esqueci-senha", { email });
      setEnviado(res.message);
    } catch (err) {
      setErro(mensagemDeErro(err));
    } finally {
      setEnviando(false);
    }
  }

  return (
    <div className="flex min-h-dvh items-center justify-center px-6 py-14">
      <div className="w-full max-w-sm animate-rise">
        <Link href="/" className="font-serif text-2xl text-pine">
          <span className="text-honey">We</span> Finance
        </Link>

        <h1 className="mt-8 font-serif text-3xl text-ink">Esqueci minha senha</h1>
        <p className="mt-1 text-sm text-sage">
          Informe o e-mail da sua conta. Enviamos um link para você escolher uma senha nova.
        </p>

        {enviado ? (
          <>
            <p className="mt-6 rounded-xl bg-pine/8 px-4 py-3 text-sm font-medium text-pine">
              {enviado}
            </p>
            <p className="mt-3 text-xs text-sage">
              O link vale por 1 hora. Não esqueça de olhar o spam.
            </p>
          </>
        ) : (
          <form onSubmit={handleSubmit} className="mt-6 space-y-4">
            <div className="space-y-1.5">
              <label htmlFor="email" className="eyebrow">E-mail</label>
              <input
                id="email"
                type="email"
                required
                autoFocus
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="input"
              />
            </div>

            {erro && <p className="text-sm font-medium text-clay">{erro}</p>}

            <button type="submit" disabled={enviando} className="btn-primary w-full disabled:opacity-60">
              {enviando ? "Enviando..." : "Enviar link"}
            </button>
          </form>
        )}

        <p className="mt-6 text-center text-sm text-sage">
          <Link href="/login" className="link-honey">Voltar para o login</Link>
        </p>
      </div>
    </div>
  );
}
