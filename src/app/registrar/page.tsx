"use client";

import { useState } from "react";
import Link from "next/link";
import { postJson } from "@/lib/http";

export default function RegistrarPage() {
  const [tipo, setTipo] = useState<"CASAL" | "UNICA">("UNICA");
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
    } catch (err: any) {
      setErro(err.message);
    } finally {
      setEnviando(false);
    }
  }

  if (enviado) {
    return (
      <div className="flex min-h-screen items-center justify-center px-4">
        <div className="w-full max-w-sm space-y-4 rounded-xl border border-slate-200 bg-white p-8 text-center shadow-sm">
          <h1 className="text-xl font-semibold text-slate-900">Confira seu email</h1>
          <p className="text-sm text-slate-600">{enviado}</p>
          <p className="text-sm text-slate-500">
            A senha temporaria de todos e <strong>Muda@123</strong> - voce troca no primeiro acesso.
          </p>
          <Link href="/login" className="inline-block text-sm text-indigo-600 hover:underline">
            Ir para o login
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center px-4">
      <form
        onSubmit={handleSubmit}
        className="w-full max-w-sm space-y-4 rounded-xl border border-slate-200 bg-white p-8 shadow-sm"
      >
        <h1 className="text-xl font-semibold text-slate-900">Criar conta - We Finance</h1>

        <div className="grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={() => setTipo("UNICA")}
            className={`rounded-lg border px-3 py-2 text-sm font-medium ${
              tipo === "UNICA"
                ? "border-indigo-600 bg-indigo-50 text-indigo-700"
                : "border-slate-300 text-slate-600"
            }`}
          >
            Conta unica
          </button>
          <button
            type="button"
            onClick={() => setTipo("CASAL")}
            className={`rounded-lg border px-3 py-2 text-sm font-medium ${
              tipo === "CASAL"
                ? "border-indigo-600 bg-indigo-50 text-indigo-700"
                : "border-slate-300 text-slate-600"
            }`}
          >
            Conta casal
          </button>
        </div>

        <div className="space-y-1">
          <label htmlFor="name" className="text-sm font-medium text-slate-700">
            Seu nome
          </label>
          <input
            id="name"
            required
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none"
          />
        </div>

        <div className="space-y-1">
          <label htmlFor="email" className="text-sm font-medium text-slate-700">
            Seu email
          </label>
          <input
            id="email"
            type="email"
            required
            value={form.email}
            onChange={(e) => setForm({ ...form, email: e.target.value })}
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none"
          />
        </div>

        {tipo === "CASAL" && (
          <>
            <div className="space-y-1">
              <label htmlFor="partnerName" className="text-sm font-medium text-slate-700">
                Nome do(a) parceiro(a)
              </label>
              <input
                id="partnerName"
                required
                value={form.partnerName}
                onChange={(e) => setForm({ ...form, partnerName: e.target.value })}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none"
              />
            </div>
            <div className="space-y-1">
              <label htmlFor="partnerEmail" className="text-sm font-medium text-slate-700">
                Email do(a) parceiro(a)
              </label>
              <input
                id="partnerEmail"
                type="email"
                required
                value={form.partnerEmail}
                onChange={(e) => setForm({ ...form, partnerEmail: e.target.value })}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none"
              />
            </div>
          </>
        )}

        <p className="text-xs text-slate-500">
          {tipo === "CASAL"
            ? "Voces dois receberao um email de confirmacao e usarao a senha temporaria Muda@123 no primeiro acesso."
            : "Voce recebera um email de confirmacao e usara a senha temporaria Muda@123 no primeiro acesso."}
        </p>

        {erro && <p className="text-sm text-red-600">{erro}</p>}

        <button
          type="submit"
          disabled={enviando}
          className="w-full rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
        >
          {enviando ? "Criando..." : "Criar conta"}
        </button>

        <p className="text-center text-sm text-slate-500">
          Ja tem conta?{" "}
          <Link href="/login" className="text-indigo-600 hover:underline">
            Entrar
          </Link>
        </p>
      </form>
    </div>
  );
}
