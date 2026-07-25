"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { getJson } from "@/lib/http";
import { currency } from "@/lib/formato";

type Bill = {
  id: string;
  name: string;
  amount: number;
  pagoEsteMes: boolean;
  vencido: boolean;
  diasAteVencer: number | null;
  entity?: { name: string } | null;
};

// Conta "a avisar": nao paga este mes E (ja vencida OU vence em ate 3 dias).
function ehAlerta(b: Bill): boolean {
  if (b.pagoEsteMes) return false;
  if (b.vencido) return true;
  return b.diasAteVencer !== null && b.diasAteVencer <= 3 && b.diasAteVencer >= 0;
}

function textoStatus(b: Bill): string {
  if (b.vencido) return "vencida";
  if (b.diasAteVencer === 0) return "vence hoje";
  return `vence em ${b.diasAteVencer} dia${b.diasAteVencer === 1 ? "" : "s"}`;
}

export default function SinoNotificacoes() {
  const [alertas, setAlertas] = useState<Bill[]>([]);
  const [aberto, setAberto] = useState(false);

  useEffect(() => {
    getJson<Bill[]>("/api/contas-a-pagar")
      .then((bills) => setAlertas(bills.filter(ehAlerta)))
      .catch(() => setAlertas([])); // sino nunca quebra a navegacao
  }, []);

  const n = alertas.length;

  return (
    <div className="relative">
      <button
        onClick={() => setAberto((v) => !v)}
        aria-label={`Contas a vencer${n ? `: ${n}` : ""}`}
        className="relative rounded-lg p-1.5 text-cream/70 transition-colors hover:bg-cream/10 hover:text-cream"
      >
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9" strokeLinecap="round" strokeLinejoin="round" />
          <path d="M13.7 21a2 2 0 0 1-3.4 0" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        {n > 0 && (
          <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-honey px-1 text-[0.65rem] font-bold text-pine-deep">
            {n > 9 ? "9+" : n}
          </span>
        )}
      </button>

      {aberto && (
        <>
          {/* backdrop para fechar ao clicar fora */}
          <button
            aria-hidden
            tabIndex={-1}
            onClick={() => setAberto(false)}
            className="fixed inset-0 z-40 cursor-default"
          />
          <div className="absolute right-0 z-50 mt-2 w-72 overflow-hidden rounded-xl border border-pine/10 bg-cream text-ink shadow-hero">
            <div className="border-b border-pine/8 px-4 py-2.5">
              <p className="eyebrow">Contas a vencer</p>
            </div>
            {n === 0 ? (
              <p className="px-4 py-6 text-center text-sm text-sage">Nada vencendo por agora. 🎉</p>
            ) : (
              <ul className="max-h-80 divide-y divide-pine/8 overflow-y-auto">
                {alertas.map((b) => (
                  <li key={b.id}>
                    <Link
                      href="/contas-a-pagar"
                      onClick={() => setAberto(false)}
                      className="flex items-center justify-between gap-3 px-4 py-3 hover:bg-pine/[0.03]"
                    >
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium text-ink">{b.name}</p>
                        <p className={`text-xs ${b.vencido ? "text-clay" : "text-sage"}`}>
                          {textoStatus(b)}
                          {b.entity?.name ? ` · ${b.entity.name}` : ""}
                        </p>
                      </div>
                      <span className="shrink-0 text-sm font-semibold tnum text-ink">
                        {currency.format(b.amount)}
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
            <Link
              href="/contas-a-pagar"
              onClick={() => setAberto(false)}
              className="block border-t border-pine/8 px-4 py-2.5 text-center text-sm font-semibold text-honey-deep hover:bg-pine/[0.03]"
            >
              Ver todas
            </Link>
          </div>
        </>
      )}
    </div>
  );
}
