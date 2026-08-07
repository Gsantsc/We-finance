"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { signOut, useSession } from "next-auth/react";
import SinoNotificacoes from "./SinoNotificacoes";

// O menu antigo era uma lista plana de substantivos abstratos, e dois deles
// colidiam: em portugues "conta" e' tanto conta bancaria quanto boleto, entao
// "Contas" e "A pagar" pareciam a mesma coisa. "Entidades" era o nome da tabela,
// nao do que a pessoa faz ali.
//
// Agora sao dois grupos - o que se usa TODO MES e o que se configura UMA VEZ -
// e cada item carrega uma frase dizendo para que serve, em vez de depender de o
// rotulo adivinhar sozinho.

// Rotina do mes: e' aqui que a pessoa entra no dia a dia.
const principais = [
  { href: "/dashboard", label: "Painel", desc: "O mês inteiro num lugar: o que entrou, o que saiu e quanto sobra." },
  { href: "/transacoes", label: "Lançamentos", desc: "Cada gasto e cada entrada, um por um." },
  { href: "/contas-a-pagar", label: "Contas a pagar", desc: "Tudo que sai no mês: contas fixas, parcelas e avulsas." },
  { href: "/orcamentos", label: "Orçamento", desc: "Quanto vocês pretendem gastar em cada categoria." },
  { href: "/metas", label: "Metas", desc: "Dinheiro guardado com um objetivo: viagem, reserva, um bem." },
];

// Ajustes: mexe-se pouco, quase sempre no comeco.
const ajustes = [
  { href: "/contas", label: "Contas e cartões", desc: "Onde o dinheiro fica: banco, cartão, VA, VR, investimento." },
  { href: "/entidades", label: "De quem é", desc: "Separe o que é da casa, o que é de cada um e o que é da PJ." },
  { href: "/regras", label: "Categorias automáticas", desc: "\"Contém iFood\" vira Alimentação sozinho." },
  { href: "/importar", label: "Importar planilha", desc: "Traga o extrato do banco por arquivo CSV." },
  { href: "/casa", label: "Nossa casa", desc: "Quem participa, convite e seus dados." },
];

export default function NavBar() {
  const pathname = usePathname();
  const router = useRouter();
  const { data: session } = useSession();
  const [aberto, setAberto] = useState(false);
  const [ajustesAberto, setAjustesAberto] = useState(false);
  const ajustesRef = useRef<HTMLDivElement>(null);

  // Menu suspenso precisa fechar clicando fora e no Esc; sem isso ele fica
  // preso aberto por cima do conteudo.
  useEffect(() => {
    if (!ajustesAberto) return;
    function foraOuEsc(e: MouseEvent | KeyboardEvent) {
      if (e instanceof KeyboardEvent) {
        if (e.key === "Escape") setAjustesAberto(false);
        return;
      }
      if (ajustesRef.current && !ajustesRef.current.contains(e.target as Node)) {
        setAjustesAberto(false);
      }
    }
    document.addEventListener("mousedown", foraOuEsc);
    document.addEventListener("keydown", foraOuEsc);
    return () => {
      document.removeEventListener("mousedown", foraOuEsc);
      document.removeEventListener("keydown", foraOuEsc);
    };
  }, [ajustesAberto]);

  // Senha temporaria ainda ativa: nada de navegar pelo app antes de trocar.
  useEffect(() => {
    if (session?.user?.mustChangePassword) router.replace("/trocar-senha");
  }, [session?.user?.mustChangePassword, router]);

  // Fecha os menus ao trocar de rota.
  useEffect(() => {
    setAberto(false);
    setAjustesAberto(false);
  }, [pathname]);

  async function sair() {
    // redirect:false + push manual: no celular o retorno acompanha a origem
    // por onde a pessoa acessa, em vez do NEXTAUTH_URL fixo.
    await signOut({ redirect: false });
    router.push("/login");
  }

  const primeiroNome = session?.user?.name?.split(" ")[0];

  return (
    <header className="sticky top-0 z-40 bg-pine text-cream shadow-hero">
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-3">
        <Link href="/dashboard" className="flex items-baseline gap-1 leading-none">
          <span className="font-serif text-2xl italic text-honey-soft">We</span>
          <span className="font-serif text-2xl text-cream">Finance</span>
        </Link>

        <nav className="hidden items-center gap-1 lg:flex">
          {principais.map((link) => {
            const ativo = pathname === link.href;
            return (
              <Link
                key={link.href}
                href={link.href}
                title={link.desc}
                className={`relative rounded-lg px-3 py-1.5 text-sm font-medium transition-colors ${
                  ativo ? "text-honey-soft" : "text-cream/70 hover:text-cream"
                }`}
              >
                {link.label}
                {ativo && (
                  <span className="absolute inset-x-3 -bottom-0.5 h-0.5 rounded-full bg-honey-soft" />
                )}
              </Link>
            );
          })}

          <div className="relative" ref={ajustesRef}>
            <button
              onClick={() => setAjustesAberto((v) => !v)}
              aria-expanded={ajustesAberto}
              aria-haspopup="true"
              className={`relative flex items-center gap-1 rounded-lg px-3 py-1.5 text-sm font-medium transition-colors ${
                ajustes.some((a) => a.href === pathname)
                  ? "text-honey-soft"
                  : "text-cream/70 hover:text-cream"
              }`}
            >
              Ajustes
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <path d="M6 9l6 6 6-6" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              {ajustes.some((a) => a.href === pathname) && (
                <span className="absolute inset-x-3 -bottom-0.5 h-0.5 rounded-full bg-honey-soft" />
              )}
            </button>

            {ajustesAberto && (
              <div className="absolute right-0 top-full z-50 mt-2 w-80 overflow-hidden rounded-xl border border-pine-700 bg-pine shadow-hero">
                {ajustes.map((a) => (
                  <Link
                    key={a.href}
                    href={a.href}
                    className={`block px-4 py-3 transition-colors hover:bg-cream/10 ${
                      pathname === a.href ? "bg-cream/10" : ""
                    }`}
                  >
                    <span
                      className={`block text-sm font-medium ${
                        pathname === a.href ? "text-honey-soft" : "text-cream"
                      }`}
                    >
                      {a.label}
                    </span>
                    <span className="mt-0.5 block text-xs leading-snug text-cream/60">{a.desc}</span>
                  </Link>
                ))}
              </div>
            )}
          </div>
        </nav>

        <div className="flex items-center gap-3">
          <Link
            href="/novo"
            className="hidden rounded-xl bg-honey px-3.5 py-2 text-sm font-semibold text-pine-deep transition-colors hover:bg-honey-soft sm:inline-flex"
          >
            + Gasto
          </Link>
          <SinoNotificacoes />
          {primeiroNome && (
            <span className="hidden text-sm text-cream/70 md:inline">Olá, {primeiroNome}</span>
          )}
          <button
            onClick={sair}
            className="hidden text-sm text-cream/60 transition-colors hover:text-cream lg:inline"
          >
            Sair
          </button>
          <button
            onClick={() => setAberto((v) => !v)}
            aria-label="Menu"
            className="rounded-lg p-1.5 text-cream/80 hover:bg-cream/10 lg:hidden"
          >
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              {aberto ? (
                <path d="M6 6l12 12M18 6L6 18" strokeLinecap="round" />
              ) : (
                <path d="M4 7h16M4 12h16M4 17h16" strokeLinecap="round" />
              )}
            </svg>
          </button>
        </div>
      </div>

      {aberto && (
        <nav className="max-h-[calc(100dvh-4rem)] overflow-y-auto border-t border-cream/10 px-4 py-3 lg:hidden">
          <Link
            href="/novo"
            className="block rounded-lg bg-honey px-3 py-2.5 text-center text-sm font-semibold text-pine-deep"
          >
            + Lançar gasto
          </Link>

          {/* Uma coluna so, com a explicacao embaixo do nome: no celular ha
              espaco de sobra na vertical, e e' onde a duvida aparece. */}
          {[
            { titulo: "No dia a dia", itens: principais },
            { titulo: "Ajustes", itens: ajustes },
          ].map((grupo) => (
            <div key={grupo.titulo} className="mt-4">
              <p className="px-3 text-xs font-semibold uppercase tracking-wider text-cream/40">
                {grupo.titulo}
              </p>
              <div className="mt-1">
                {grupo.itens.map((link) => (
                  <Link
                    key={link.href}
                    href={link.href}
                    className={`block rounded-lg px-3 py-2.5 ${
                      pathname === link.href ? "bg-cream/10" : "hover:bg-cream/5"
                    }`}
                  >
                    <span
                      className={`block text-sm font-medium ${
                        pathname === link.href ? "text-honey-soft" : "text-cream/90"
                      }`}
                    >
                      {link.label}
                    </span>
                    <span className="mt-0.5 block text-xs leading-snug text-cream/55">
                      {link.desc}
                    </span>
                  </Link>
                ))}
              </div>
            </div>
          ))}

          <button
            onClick={sair}
            className="mt-4 w-full rounded-lg px-3 py-2 text-left text-sm text-cream/60 hover:bg-cream/5"
          >
            Sair
          </button>
        </nav>
      )}
    </header>
  );
}
