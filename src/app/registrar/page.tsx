"use client";

import { useState } from "react";
import Link from "next/link";
import { postJson, mensagemDeErro } from "@/lib/http";

function Wordmark() {
  return (
    <Link href="/" className="flex items-baseline justify-center gap-1.5 leading-none">
      <span className="font-serif text-3xl italic text-honey-deep">We</span>
      <span className="font-serif text-3xl text-pine">Finance</span>
    </Link>
  );
}

export default function RegistrarPage() {
  const [tipo, setTipo] = useState<"CASAL" | "UNICA">("CASAL");
  const [form, setForm] = useState({ name: "", email: "", partnerName: "", partnerEmail: "" });
  const [erro, setErro] = useState("");
  const [enviado, setEnviado] = useState("");
  const [enviando, setEnviando] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErro("");
    setEnviando(true);
    try {
      const res = await postJson<{ message: string }>("/api/auth/registrar", {
        tipo,
        name: form.name,
        email: form.email,
        ...(tipo === "CASAL"
          ? { partnerName: form.partnerName, partnerEmail: form.partnerEmail }
          : {}),
      });
      setEnviado(res.message);
    } catch (err) {
      setErro(mensagemDeErro(err));
    } finally {
      setEnviando(false);
    }
  }

  if (enviado) {
    return (
      <div className="flex min-h-dvh items-center justify-center px-6 py-14">
        <div className="card w-full max-w-md animate-rise p-8 text-center">
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-pine/8 text-2xl">
            ✉
          </div>
          <h1 className="font-serif text-2xl text-ink">Confira o email</h1>
          <p className="mt-2 text-sm text-sage">{enviado}</p>
          <p className="mt-4 rounded-xl bg-honey/10 px-4 py-3 text-sm text-pine">
            A senha temporaria de todos e <strong>Muda@123</strong> — voce cria a sua no primeiro acesso.
          </p>
          <Link href="/login" className="btn-primary mt-6 w-full">
            Ir para o login
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-dvh items-center justify-center px-6 py-14">
      <div className="w-full max-w-md animate-rise">
        <Wordmark />
        <div className="card mt-8 p-8">
          <h1 className="font-serif text-2xl text-ink">Criar a conta de voces</h1>
          <p className="mt-1 text-sm text-sage">Comecem juntos, ou so voce por enquanto.</p>

          {/* Toggle casal / unica: a escolha do casal vem primeiro (o coracao do app). */}
          <div className="mt-5 grid grid-cols-2 gap-2 rounded-xl bg-pine/5 p-1">
            <button
              type="button"
              onClick={() => setTipo("CASAL")}
              className={`rounded-lg px-3 py-2 text-sm font-semibold transition-all ${
                tipo === "CASAL" ? "bg-pine text-cream shadow-sm" : "text-pine/60 hover:text-pine"
              }`}
            >
              Nos dois
            </button>
            <button
              type="button"
              onClick={() => setTipo("UNICA")}
              className={`rounded-lg px-3 py-2 text-sm font-semibold transition-all ${
                tipo === "UNICA" ? "bg-pine text-cream shadow-sm" : "text-pine/60 hover:text-pine"
              }`}
            >
              So eu
            </button>
          </div>

          <form onSubmit={handleSubmit} className="mt-5 space-y-4">
            <div className="space-y-1.5">
              <label htmlFor="name" className="eyebrow">Seu nome</label>
              <input id="name" required value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })} className="input" />
            </div>
            <div className="space-y-1.5">
              <label htmlFor="email" className="eyebrow">Seu email</label>
              <input id="email" type="email" required value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })} className="input" />
            </div>

            {tipo === "CASAL" && (
              <div className="space-y-4 rounded-xl border border-pine/10 bg-pine/[0.03] p-4">
                <p className="eyebrow text-honey-deep">Parceiro(a)</p>
                <div className="space-y-1.5">
                  <label htmlFor="partnerName" className="eyebrow">Nome</label>
                  <input id="partnerName" required value={form.partnerName}
                    onChange={(e) => setForm({ ...form, partnerName: e.target.value })} className="input" />
                </div>
                <div className="space-y-1.5">
                  <label htmlFor="partnerEmail" className="eyebrow">Email</label>
                  <input id="partnerEmail" type="email" required value={form.partnerEmail}
                    onChange={(e) => setForm({ ...form, partnerEmail: e.target.value })} className="input" />
                </div>
              </div>
            )}

            <p className="text-xs leading-relaxed text-sage">
              {tipo === "CASAL"
                ? "Voces dois recebem um email de confirmacao e entram com a senha temporaria Muda@123."
                : "Voce recebe um email de confirmacao e entra com a senha temporaria Muda@123."}
            </p>

            {erro && <p className="text-sm font-medium text-clay">{erro}</p>}

            <button type="submit" disabled={enviando} className="btn-accent w-full">
              {enviando ? "Criando..." : "Criar conta"}
            </button>
          </form>
        </div>

        <p className="mt-6 text-center text-sm text-sage">
          Ja tem conta?{" "}
          <Link href="/login" className="link-honey">Entrar</Link>
        </p>
      </div>
    </div>
  );
}
