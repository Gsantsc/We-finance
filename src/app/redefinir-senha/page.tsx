"use client";

import { Suspense, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { postJson, mensagemDeErro } from "@/lib/http";

function Formulario() {
  const router = useRouter();
  const token = useSearchParams().get("token") ?? "";
  const [senha, setSenha] = useState("");
  const [confirma, setConfirma] = useState("");
  const [erro, setErro] = useState("");
  const [salvando, setSalvando] = useState(false);
  const [pronto, setPronto] = useState(false);

  // Regras espelhadas do senhaForte em schemas.ts, so para o usuario ver o que
  // falta antes de enviar. Quem valida de verdade continua sendo o servidor.
  const regras = [
    { ok: senha.length >= 8, texto: "8 caracteres ou mais" },
    { ok: /[a-z]/.test(senha), texto: "uma letra minúscula" },
    { ok: /[A-Z]/.test(senha), texto: "uma letra maiúscula" },
    { ok: /[0-9]/.test(senha), texto: "um número" },
  ];
  const forte = regras.every((r) => r.ok);
  const confere = senha.length > 0 && senha === confirma;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (salvando) return;
    setSalvando(true);
    setErro("");
    try {
      await postJson("/api/auth/redefinir-senha", { token, newPassword: senha });
      setPronto(true);
      setTimeout(() => router.push("/login"), 2200);
    } catch (err) {
      setErro(mensagemDeErro(err));
    } finally {
      setSalvando(false);
    }
  }

  if (!token) {
    return (
      <>
        <h1 className="mt-8 font-serif text-3xl text-ink">Link inválido</h1>
        <p className="mt-2 text-sm text-sage">
          Este endereço não tem um token de redefinição. Peça um link novo.
        </p>
        <Link href="/esqueci-senha" className="btn-primary mt-6 inline-block">
          Pedir novo link
        </Link>
      </>
    );
  }

  if (pronto) {
    return (
      <>
        <h1 className="mt-8 font-serif text-3xl text-ink">Senha alterada</h1>
        <p className="mt-2 rounded-xl bg-pine/8 px-4 py-3 text-sm font-medium text-pine">
          Pronto! Levando você para o login...
        </p>
      </>
    );
  }

  return (
    <>
      <h1 className="mt-8 font-serif text-3xl text-ink">Nova senha</h1>
      <p className="mt-1 text-sm text-sage">Escolha uma senha que só você saiba.</p>

      <form onSubmit={handleSubmit} className="mt-6 space-y-4">
        <div className="space-y-1.5">
          <label htmlFor="senha" className="eyebrow">Nova senha</label>
          <input
            id="senha"
            type="password"
            required
            autoFocus
            value={senha}
            onChange={(e) => setSenha(e.target.value)}
            className="input"
          />
        </div>

        <ul className="space-y-1 text-xs">
          {regras.map((r) => (
            <li key={r.texto} className={r.ok ? "text-pine-600" : "text-sage"}>
              {r.ok ? "✓" : "○"} {r.texto}
            </li>
          ))}
        </ul>

        <div className="space-y-1.5">
          <label htmlFor="confirma" className="eyebrow">Repita a senha</label>
          <input
            id="confirma"
            type="password"
            required
            value={confirma}
            onChange={(e) => setConfirma(e.target.value)}
            className="input"
          />
          {confirma.length > 0 && !confere && (
            <p className="text-xs text-clay">As duas senhas não são iguais.</p>
          )}
        </div>

        {erro && <p className="text-sm font-medium text-clay">{erro}</p>}

        <button
          type="submit"
          disabled={salvando || !forte || !confere}
          className="btn-primary w-full disabled:opacity-50"
        >
          {salvando ? "Salvando..." : "Salvar senha"}
        </button>
      </form>
    </>
  );
}

export default function RedefinirSenhaPage() {
  return (
    <div className="flex min-h-dvh items-center justify-center px-6 py-14">
      <div className="w-full max-w-sm animate-rise">
        <Link href="/" className="font-serif text-2xl text-pine">
          <span className="text-honey">We</span> Finance
        </Link>
        <Suspense>
          <Formulario />
        </Suspense>
        <p className="mt-6 text-center text-sm text-sage">
          <Link href="/login" className="link-honey">Voltar para o login</Link>
        </p>
      </div>
    </div>
  );
}
