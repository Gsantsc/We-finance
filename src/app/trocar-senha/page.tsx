"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { postJson } from "@/lib/http";

export default function TrocarSenhaPage() {
  const router = useRouter();
  const { update } = useSession();
  const [form, setForm] = useState({ newPassword: "", confirm: "" });
  const [erro, setErro] = useState("");
  const [salvando, setSalvando] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErro("");
    if (form.newPassword !== form.confirm) {
      setErro("As senhas nao conferem.");
      return;
    }
    setSalvando(true);
    try {
      await postJson("/api/auth/trocar-senha", { newPassword: form.newPassword });
      await update(); // limpa o mustChangePassword do JWT antes de seguir
      router.push("/dashboard");
    } catch (err: any) {
      setErro(err.message);
    } finally {
      setSalvando(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center px-6 py-14">
      <div className="card w-full max-w-sm animate-rise p-8">
        <p className="eyebrow text-honey-deep">Primeiro acesso</p>
        <h1 className="mt-2 font-serif text-2xl text-ink">Crie a sua senha</h1>
        <p className="mt-1 text-sm text-sage">
          Voce entrou com a senha temporaria. Escolha a definitiva: 8+ caracteres,
          com maiuscula, minuscula e numero.
        </p>

        <form onSubmit={handleSubmit} className="mt-6 space-y-4">
          <div className="space-y-1.5">
            <label htmlFor="newPassword" className="eyebrow">Nova senha</label>
            <input id="newPassword" type="password" required minLength={8} value={form.newPassword}
              onChange={(e) => setForm({ ...form, newPassword: e.target.value })} className="input" />
          </div>
          <div className="space-y-1.5">
            <label htmlFor="confirm" className="eyebrow">Repita a senha</label>
            <input id="confirm" type="password" required minLength={8} value={form.confirm}
              onChange={(e) => setForm({ ...form, confirm: e.target.value })} className="input" />
          </div>

          {erro && <p className="text-sm font-medium text-clay">{erro}</p>}

          <button type="submit" disabled={salvando} className="btn-primary w-full">
            {salvando ? "Salvando..." : "Salvar e entrar"}
          </button>
        </form>
      </div>
    </div>
  );
}
