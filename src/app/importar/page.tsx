"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import NavBar from "@/components/NavBar";
import ErroBanner from "@/components/ErroBanner";
import { getJson, postJson, mensagemDeErro } from "@/lib/http";
import { parseCSV, parseAmount, parseDateBR } from "@/lib/csv";

type Account = { id: string; name: string; entity?: { name: string } | null };

const currency = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
const NADA = "-1"; // "sem coluna" nos selects de mapeamento

export default function ImportarPage() {
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [accountId, setAccountId] = useState("");
  const [erro, setErro] = useState("");

  const [filename, setFilename] = useState("");
  const [headers, setHeaders] = useState<string[]>([]);
  const [rows, setRows] = useState<string[][]>([]);

  // Indices das colunas mapeadas (string para caber no <select>).
  const [map, setMap] = useState({ date: NADA, description: NADA, amount: NADA, category: NADA });
  const [positivoEhGasto, setPositivoEhGasto] = useState(false);

  const [enviando, setEnviando] = useState(false);
  const [resultado, setResultado] = useState<{ created: number; skipped: number } | null>(null);

  useEffect(() => {
    getJson<Account[]>("/api/contas").then(setAccounts).catch((e) => setErro(mensagemDeErro(e)));
  }, []);

  function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setResultado(null);
    setErro("");
    setFilename(file.name);
    const reader = new FileReader();
    reader.onload = () => {
      const grid = parseCSV(String(reader.result ?? ""));
      if (grid.length < 2) {
        setErro("A planilha precisa ter um cabecalho e ao menos uma linha.");
        setHeaders([]);
        setRows([]);
        return;
      }
      const [head, ...body] = grid;
      setHeaders(head);
      setRows(body);
      // Palpite de mapeamento pelos nomes das colunas.
      const guess = (alvos: string[]) =>
        String(head.findIndex((h) => alvos.some((a) => h.toLowerCase().includes(a))));
      setMap({
        date: guess(["data", "date"]),
        description: guess(["desc", "hist", "lanc", "memo"]),
        amount: guess(["valor", "amount", "montante"]),
        category: guess(["categ", "category"]),
      });
    };
    reader.readAsText(file, "utf-8");
  }

  // Linhas convertidas + validadas para preview e envio.
  const parsed = useMemo(() => {
    const di = Number(map.date);
    const desci = Number(map.description);
    const ai = Number(map.amount);
    const ci = Number(map.category);
    if (di < 0 || desci < 0 || ai < 0) return [];
    return rows.map((r) => {
      const date = parseDateBR(r[di] ?? "");
      let amount = parseAmount(r[ai] ?? "");
      if (amount !== null && positivoEhGasto) amount = -amount;
      const description = (r[desci] ?? "").trim();
      const categoryName = ci >= 0 ? (r[ci] ?? "").trim() || null : null;
      const valido = !!date && amount !== null && amount !== 0 && description.length > 0;
      return { date, description, amount, categoryName, valido };
    });
  }, [rows, map, positivoEhGasto]);

  const validos = parsed.filter((p) => p.valido);
  const invalidos = parsed.length - validos.length;
  const podeImportar = accountId && validos.length > 0;

  async function importar() {
    setEnviando(true);
    setErro("");
    try {
      const res = await postJson<{ created: number; skipped: number }>("/api/transacoes/importar", {
        accountId,
        filename,
        rows: validos.map((v) => ({
          date: v.date,
          description: v.description,
          amount: v.amount,
          categoryName: v.categoryName,
        })),
      });
      setResultado(res);
    } catch (e) {
      setErro(mensagemDeErro(e));
    } finally {
      setEnviando(false);
    }
  }

  const colOptions = (
    <>
      <option value={NADA}>—</option>
      {headers.map((h, i) => (
        <option key={i} value={i}>
          {h || `Coluna ${i + 1}`}
        </option>
      ))}
    </>
  );

  return (
    <div>
      <NavBar />
      <main className="mx-auto max-w-4xl space-y-8 px-4 py-8">
        <div>
          <p className="eyebrow text-honey-deep">Migrar historico</p>
          <h1 className="mt-1 font-serif text-3xl text-ink">Importar planilha</h1>
          <p className="mt-1 text-sm text-sage">
            Traga seus gastos de uma planilha em CSV. No Excel ou Google Sheets:
            Arquivo → Salvar como / Baixar → CSV. O arquivo fica no seu navegador;
            so os lancamentos escolhidos sao enviados.
          </p>
        </div>

        <ErroBanner mensagem={erro} />

        {resultado ? (
          <div className="card space-y-4 p-8 text-center">
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-pine/8 text-2xl">✓</div>
            <h2 className="font-serif text-2xl text-ink">Importacao concluida</h2>
            <p className="text-sm text-sage">
              <strong className="text-ink">{resultado.created}</strong> lancamento(s) importado(s)
              {resultado.skipped > 0 && (
                <> · <strong className="text-ink">{resultado.skipped}</strong> ignorado(s) (ja existiam ou repetidos)</>
              )}
              .
            </p>
            <div className="flex justify-center gap-3">
              <Link href="/transacoes" className="btn-primary">Ver lancamentos</Link>
              <button
                onClick={() => {
                  setResultado(null);
                  setHeaders([]);
                  setRows([]);
                  setFilename("");
                }}
                className="btn-ghost"
              >
                Importar outra
              </button>
            </div>
          </div>
        ) : (
          <>
            {/* Passo 1 — conta + arquivo */}
            <section className="card space-y-4 p-6">
              <div className="space-y-1.5">
                <label htmlFor="conta" className="eyebrow">Importar para a conta</label>
                <select id="conta" value={accountId} onChange={(e) => setAccountId(e.target.value)} className="input">
                  <option value="" disabled>Escolher conta</option>
                  {accounts.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.name}{a.entity ? ` (${a.entity.name})` : ""}
                    </option>
                  ))}
                </select>
                {accounts.length === 0 && (
                  <p className="text-xs text-sage">
                    Voce ainda nao tem contas. Crie uma em{" "}
                    <Link href="/contas" className="link-honey">Contas</Link> primeiro.
                  </p>
                )}
              </div>

              <div className="space-y-1.5">
                <label htmlFor="arquivo" className="eyebrow">Arquivo CSV</label>
                <input
                  id="arquivo"
                  type="file"
                  accept=".csv,text/csv"
                  onChange={handleFile}
                  className="block w-full text-sm text-ink file:mr-3 file:rounded-lg file:border-0 file:bg-pine file:px-4 file:py-2 file:text-sm file:font-semibold file:text-cream hover:file:bg-pine-700"
                />
                {filename && <p className="text-xs text-sage">{filename} · {rows.length} linha(s)</p>}
              </div>
            </section>

            {/* Passo 2 — mapear colunas */}
            {headers.length > 0 && (
              <section className="card space-y-4 p-6">
                <h2 className="eyebrow">Mapear colunas</h2>
                <div className="grid gap-4 sm:grid-cols-2">
                  {[
                    { key: "date", label: "Data" },
                    { key: "description", label: "Descricao" },
                    { key: "amount", label: "Valor" },
                    { key: "category", label: "Categoria (opcional)" },
                  ].map((f) => (
                    <div key={f.key} className="space-y-1.5">
                      <label className="eyebrow">{f.label}</label>
                      <select
                        value={(map as any)[f.key]}
                        onChange={(e) => setMap({ ...map, [f.key]: e.target.value })}
                        className="input"
                      >
                        {colOptions}
                      </select>
                    </div>
                  ))}
                </div>
                <label className="flex items-center gap-2 text-sm text-ink/80">
                  <input
                    type="checkbox"
                    checked={positivoEhGasto}
                    onChange={(e) => setPositivoEhGasto(e.target.checked)}
                    className="h-4 w-4 rounded border-pine/20"
                  />
                  Nesta planilha, valores <strong>positivos</strong> sao gastos (inverter o sinal)
                </label>
              </section>
            )}

            {/* Passo 3 — preview */}
            {parsed.length > 0 && (
              <section className="space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h2 className="eyebrow">Previa</h2>
                  <p className="text-xs text-sage">
                    {validos.length} pronto(s){invalidos > 0 && ` · ${invalidos} com problema (serao ignorados)`}
                  </p>
                </div>
                <div className="card overflow-x-auto">
                  <table className="w-full min-w-[560px] text-sm">
                    <thead className="bg-pine/[0.04] text-left text-sage">
                      <tr>
                        <th className="px-4 py-2 font-medium">Data</th>
                        <th className="px-4 py-2 font-medium">Descricao</th>
                        <th className="px-4 py-2 font-medium">Categoria</th>
                        <th className="px-4 py-2 text-right font-medium">Valor</th>
                      </tr>
                    </thead>
                    <tbody>
                      {parsed.slice(0, 12).map((p, i) => (
                        <tr key={i} className={`border-t border-pine/8 ${p.valido ? "" : "bg-clay/[0.04]"}`}>
                          <td className="px-4 py-2 text-sage">
                            {p.date ?? <span className="text-clay">data invalida</span>}
                          </td>
                          <td className="px-4 py-2 text-ink">{p.description || <span className="text-clay">vazia</span>}</td>
                          <td className="px-4 py-2 text-sage">{p.categoryName ?? "-"}</td>
                          <td className={`px-4 py-2 text-right font-semibold tnum ${
                            p.amount == null ? "text-clay" : p.amount < 0 ? "text-clay" : "text-pine-600"
                          }`}>
                            {p.amount == null ? "invalido" : currency.format(p.amount)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {parsed.length > 12 && (
                    <p className="px-4 py-2 text-xs text-sage">+ {parsed.length - 12} linha(s) nao mostradas.</p>
                  )}
                </div>

                <button onClick={importar} disabled={!podeImportar || enviando} className="btn-accent w-full py-3">
                  {enviando
                    ? "Importando..."
                    : accountId
                    ? `Importar ${validos.length} lancamento(s)`
                    : "Escolha a conta acima"}
                </button>
              </section>
            )}
          </>
        )}
      </main>
    </div>
  );
}
