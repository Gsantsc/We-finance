"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import NavBar from "@/components/NavBar";
import ErroBanner from "@/components/ErroBanner";
import { getJson } from "@/lib/http";
import { formatDateBR } from "@/lib/formato";

type Account = { id: string; name: string; balance: number; type: string };
type Entity = {
  id: string;
  name: string;
  type: "CASA" | "PESSOAL" | "PJ";
  color: string;
  accounts: Account[];
  owner?: { name: string } | null;
};
type Transaction = {
  id: string;
  description: string;
  amount: number;
  date: string;
  account: { name: string; entity?: { name: string } | null };
  category?: { name: string; icon: string } | null;
};

const currency = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
const groupLabel: Record<string, string> = { CASA: "Casa", PESSOAL: "Pessoal", PJ: "PJ" };

export default function DashboardPage() {
  const [entities, setEntities] = useState<Entity[]>([]);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [semEntidade, setSemEntidade] = useState(0);
  const [erro, setErro] = useState("");

  async function load() {
    try {
      const [entRes, txRes, accRes] = await Promise.all([
        getJson<Entity[]>("/api/entidades"),
        getJson<Transaction[]>("/api/transacoes?limit=8"),
        getJson<{ entityId?: string | null }[]>("/api/contas"),
      ]);
      setEntities(entRes);
      setTransactions(txRes);
      setSemEntidade(accRes.filter((a) => !a.entityId).length);
      setErro("");
    } catch (e: any) {
      setErro(e.message);
    }
  }

  useEffect(() => {
    load();
  }, []);

  const total = entities.reduce((sum, e) => sum + e.accounts.reduce((s, a) => s + a.balance, 0), 0);
  const totalContas = entities.reduce((n, e) => n + e.accounts.length, 0);

  const grouped: Record<string, Entity[]> = { CASA: [], PESSOAL: [], PJ: [] };
  for (const e of entities) grouped[e.type]?.push(e);

  return (
    <div>
      <NavBar />
      <main className="mx-auto max-w-6xl space-y-10 px-4 py-8">
        <ErroBanner mensagem={erro} />

        {/* Hero: patrimonio como manchete. O coracao emocional da tela. */}
        <section className="relative overflow-hidden rounded-2xl bg-pine px-6 py-8 text-cream shadow-hero sm:px-9 sm:py-10 animate-rise">
          <div
            aria-hidden
            className="pointer-events-none absolute -right-20 -top-24 h-80 w-80 rounded-full"
            style={{ background: "radial-gradient(circle, rgba(231,183,90,0.18), transparent 70%)" }}
          />
          <div className="relative flex flex-wrap items-end justify-between gap-6">
            <div>
              <p className="eyebrow text-honey-soft/80">Patrimonio de voces</p>
              <p className="mt-2 font-serif text-5xl leading-none tracking-tight tnum sm:text-6xl">
                {currency.format(total)}
              </p>
              <p className="mt-3 text-sm text-cream/60">
                {entities.length} entidade{entities.length === 1 ? "" : "s"} &middot; {totalContas} conta
                {totalContas === 1 ? "" : "s"}
              </p>
            </div>
            <Link
              href="/novo"
              className="rounded-xl bg-honey px-4 py-2.5 text-sm font-semibold text-pine-deep transition-colors hover:bg-honey-soft"
            >
              + Lancar gasto
            </Link>
          </div>

          {semEntidade > 0 && (
            <Link
              href="/contas"
              className="relative mt-6 inline-flex items-center gap-2 rounded-xl bg-honey/15 px-4 py-2.5 text-sm text-honey-soft transition-colors hover:bg-honey/25"
            >
              <span aria-hidden>→</span>
              {semEntidade} conta{semEntidade === 1 ? "" : "s"} sem entidade ficam fora do total. Classificar.
            </Link>
          )}
        </section>

        {/* Por entidade, agrupado por Casa / Pessoal / PJ. */}
        {Object.entries(grouped).map(([type, ents]) =>
          ents.length ? (
            <section key={type} className="space-y-4">
              <h2 className="eyebrow">{groupLabel[type]}</h2>
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {ents.map((e) => {
                  const entTotal = e.accounts.reduce((s, a) => s + a.balance, 0);
                  return (
                    <div key={e.id} className="card flex overflow-hidden">
                      <span className="w-1.5 shrink-0" style={{ backgroundColor: e.color || "#356154" }} />
                      <div className="flex-1 p-5">
                        <div className="flex items-start justify-between gap-2">
                          <h3 className="font-medium text-ink">{e.name}</h3>
                          {e.owner?.name && (
                            <span className="chip bg-pine/6 text-pine/70">{e.owner.name.split(" ")[0]}</span>
                          )}
                        </div>
                        <p className="mt-3 font-serif text-3xl text-ink tnum">{currency.format(entTotal)}</p>
                        <p className="mt-1 text-xs text-sage">
                          {e.accounts.length} conta{e.accounts.length === 1 ? "" : "s"}
                        </p>
                      </div>
                    </div>
                  );
                })}
              </div>
            </section>
          ) : null
        )}

        {/* Ultimos lancamentos como lista calma, nao tabela dura. */}
        <section className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="eyebrow">Ultimos lancamentos</h2>
            <Link href="/transacoes" className="link-honey text-sm">Ver todos</Link>
          </div>
          <div className="card divide-y divide-pine/8">
            {transactions.map((t) => (
              <div key={t.id} className="flex items-center gap-4 px-5 py-3.5">
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-pine/6 text-base">
                  {t.category?.icon ?? "•"}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-ink">{t.description}</p>
                  <p className="truncate text-xs text-sage">
                    {formatDateBR(t.date)}
                    {t.account.entity?.name ? ` · ${t.account.entity.name}` : ""}
                  </p>
                </div>
                <span
                  className={`shrink-0 text-sm font-semibold tnum ${
                    t.amount < 0 ? "text-clay" : "text-pine-600"
                  }`}
                >
                  {currency.format(t.amount)}
                </span>
              </div>
            ))}
            {transactions.length === 0 && (
              <p className="px-5 py-10 text-center text-sm text-sage">
                Nenhum lancamento ainda.{" "}
                <Link href="/novo" className="link-honey">Lancar o primeiro</Link>.
              </p>
            )}
          </div>
        </section>
      </main>
    </div>
  );
}
