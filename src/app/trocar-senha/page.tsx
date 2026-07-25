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
      // Atualiza o JWT da sessao (limpa o mustChangePassword) antes de seguir.
      await update();
      router.push("/dashboard");
    } catch (err: any) {
      setErro(err.message);
    } finally {
      setSalvando(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center px-4">
      <form
        onSubmit={handleSubmit}
        className="w-full max-w-sm space-y-4 rounded-xl border border-slate-200 bg-white p-8 shadow-sm"
      >
        <h1 className="text-xl font-semibold text-slate-900">Criar sua senha</h1>
        <p className="text-sm text-slate-500">
          Voce entrou com a senha temporaria. Escolha agora a sua senha definitiva:
          minimo 8 caracteres, com maiuscula, minuscula e numero.
        </p>

        <div className="space-y-1">
          <label htmlFor="newPassword" className="text-sm font-medium text-slate-700">
            Nova senha
          </label>
          <input
            id="newPassword"
            type="password"
            required
            minLength={8}
            value={form.newPassword}
            onChange={(e) => setForm({ ...form, newPassword: e.target.value })}
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none"
          />
        </div>

        <div className="space-y-1">
          <label htmlFor="confirm" className="text-sm font-medium text-slate-700">
            Repita a senha
          </label>
          <input
            id="confirm"
            type="password"
            required
            minLength={8}
            value={form.confirm}
            onChange={(e) => setForm({ ...form, confirm: e.target.value })}
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none"
          />
        </div>

        {erro && <p className="text-sm text-red-600">{erro}</p>}

        <button
          type="submit"
          disabled={salvando}
          className="w-full rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
        >
          {salvando ? "Salvando..." : "Salvar senha"}
        </button>
      </form>
    </div>
  );
}
