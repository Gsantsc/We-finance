"use client";

import { useEffect, useState } from "react";
import NavBar from "@/components/NavBar";
import ErroBanner from "@/components/ErroBanner";
import { SkeletonLinha } from "@/components/Skeleton";
import { signOut } from "next-auth/react";
import { getJson, postJson, deleteJson, mensagemDeErro } from "@/lib/http";

type Membro = { id: string; name: string; role?: string };
type Casa = {
  id: string;
  name: string;
  inviteCode: string;
  membros: Membro[];
  vagas: number;
};

export default function CasaPage() {
  const [casa, setCasa] = useState<Casa | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState("");
  const [copiado, setCopiado] = useState(false);
  const [regenerando, setRegenerando] = useState(false);
  const [excluindo, setExcluindo] = useState(false);

  async function load() {
    try {
      setCasa(await getJson<Casa>("/api/casa"));
      setErro("");
    } catch (e) {
      setErro(mensagemDeErro(e));
    } finally {
      setCarregando(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  // O link so pode ser montado no cliente: em SSR nao existe window.location.
  const link = casa ? `${window.location.origin}/registrar?convite=${casa.inviteCode}` : "";

  async function copiar() {
    try {
      await navigator.clipboard.writeText(link);
      setCopiado(true);
      setTimeout(() => setCopiado(false), 2500);
    } catch {
      setErro("Não consegui copiar. Selecione o link e copie na mão.");
    }
  }

  // Duas confirmacoes de proposito: a segunda exige DIGITAR a palavra. Um
  // "tem certeza?" sozinho e' clicado no automatico, e aqui nao ha volta.
  async function excluir() {
    if (!casa) return;
    if (!confirm("Apagar a casa e TODOS os dados de vocês? Isso não pode ser desfeito.")) return;
    const digitado = prompt('Para confirmar, digite APAGAR em maiúsculas:');
    if (digitado !== "APAGAR") {
      if (digitado !== null) setErro("Confirmação não conferiu. Nada foi apagado.");
      return;
    }
    setExcluindo(true);
    try {
      await deleteJson("/api/casa/dados?confirmacao=APAGAR");
      await signOut({ callbackUrl: "/" });
    } catch (e) {
      setErro(mensagemDeErro(e));
      setExcluindo(false);
    }
  }

  async function regenerar() {
    if (!confirm("Gerar um convite novo? O link atual para de funcionar imediatamente.")) return;
    setRegenerando(true);
    try {
      await postJson("/api/casa", { acao: "regenerar" });
      await load();
    } catch (e) {
      setErro(mensagemDeErro(e));
    } finally {
      setRegenerando(false);
    }
  }

  return (
    <div>
      <NavBar />
      <main className="mx-auto max-w-3xl space-y-6 px-4 py-8">
        <h1 className="font-serif text-3xl text-ink">Nossa casa</h1>
        <ErroBanner mensagem={erro} />

        {carregando && (
          <div className="card space-y-3 p-5">
            <SkeletonLinha className="h-4 w-40" />
            <SkeletonLinha className="h-10 w-full" />
            <SkeletonLinha className="h-4 w-32" />
          </div>
        )}

        {casa && (
          <>
            <section className="card p-5">
              <h2 className="font-medium text-ink">Quem já está aqui</h2>
              <ul className="mt-3 divide-y divide-pine/8">
                {casa.membros.map((m) => (
                  <li key={m.id} className="flex items-center justify-between py-2.5 text-sm">
                    <span className="text-ink">{m.name}</span>
                    {m.role === "owner" && (
                      <span className="chip bg-pine/8 text-xs text-pine/70">criou a casa</span>
                    )}
                  </li>
                ))}
              </ul>
            </section>

            <section className="card p-5">
              <h2 className="font-medium text-ink">Convidar a outra pessoa</h2>

              {casa.vagas === 0 ? (
                <p className="mt-2 text-sm text-sage">
                  A casa já está completa. Para trocar quem participa, gere um convite novo
                  depois de remover alguém.
                </p>
              ) : (
                <>
                  <p className="mt-1 text-sm text-sage">
                    Mande este link para quem vai dividir as contas com você. Quem abrir cria a
                    conta dela e cai direto nesta casa — vocês passam a ver os mesmos lançamentos.
                  </p>

                  <div className="mt-4 flex flex-wrap items-center gap-2">
                    <input
                      readOnly
                      value={link}
                      onFocus={(e) => e.currentTarget.select()}
                      className="input flex-1 min-w-[240px] font-mono text-xs"
                      aria-label="Link de convite"
                    />
                    <button onClick={copiar} className="btn-primary whitespace-nowrap">
                      {copiado ? "Copiado!" : "Copiar link"}
                    </button>
                  </div>

                  <p className="mt-3 text-xs text-sage">
                    Trate como senha: quem tiver este link entra na casa e vê todo o dinheiro
                    de vocês.
                  </p>
                </>
              )}

              <button
                onClick={regenerar}
                disabled={regenerando}
                className="btn-ghost mt-4 text-sm disabled:opacity-60"
              >
                {regenerando ? "Gerando..." : "Gerar convite novo"}
              </button>
              <p className="mt-1 text-xs text-sage">
                Use se o link foi parar no lugar errado. O anterior deixa de valer na hora.
              </p>
            </section>

            <section className="card p-5">
              <h2 className="font-medium text-ink">Seus dados</h2>
              <p className="mt-1 text-sm text-sage">
                Os dados são de vocês. Pode levar embora ou apagar quando quiser.
              </p>

              <a href="/api/casa/dados" download className="btn-ghost mt-4 inline-block text-sm">
                Baixar tudo (JSON)
              </a>
              <p className="mt-1 text-xs text-sage">
                Lançamentos, contas, metas, contas a pagar e orçamentos. Sem senhas.
              </p>

              <div className="mt-6 rounded-xl border border-clay/25 bg-clay/5 p-4">
                <p className="text-sm font-medium text-clay">Apagar a conta</p>
                <p className="mt-1 text-xs text-ink/70">
                  Apaga a casa, os lançamentos e os cadastros de vocês dois, de forma
                  definitiva. Não dá para desfazer — baixe seus dados antes.
                </p>
                <button onClick={excluir} disabled={excluindo} className="btn-ghost mt-3 text-sm text-clay disabled:opacity-60">
                  {excluindo ? "Apagando..." : "Apagar tudo definitivamente"}
                </button>
              </div>
            </section>
          </>
        )}
      </main>
    </div>
  );
}
