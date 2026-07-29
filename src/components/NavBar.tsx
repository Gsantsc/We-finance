"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { signOut, useSession } from "next-auth/react";
import SinoNotificacoes from "./SinoNotificacoes";

const links = [
  { href: "/dashboard", label: "Painel" },
  { href: "/contas", label: "Contas" },
  { href: "/transacoes", label: "Lançamentos" },
  { href: "/orcamentos", label: "Orçamentos" },
  { href: "/metas", label: "Metas" },
  { href: "/contas-a-pagar", label: "A pagar" },
  { href: "/entidades", label: "Entidades" },
];

// Atalhos que nao entram na barra principal (aparecem so no menu mobile).
const extras = [
  { href: "/importar", label: "Importar CSV" },
  { href: "/regras", label: "Regras de categoria" },
];

export default function NavBar() {
  const pathname = usePathname();
  const router = useRouter();
  const { data: session } = useSession();
  const [aberto, setAberto] = useState(false);

  // Senha temporaria ainda ativa: nada de navegar pelo app antes de trocar.
  useEffect(() => {
    if (session?.user?.mustChangePassword) router.replace("/trocar-senha");
  }, [session?.user?.mustChangePassword, router]);

  // Fecha o menu mobile ao trocar de rota.
  useEffect(() => {
    setAberto(false);
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
          {links.map((link) => {
            const ativo = pathname === link.href;
            return (
              <Link
                key={link.href}
                href={link.href}
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
        <nav className="border-t border-cream/10 px-4 py-3 lg:hidden">
          <div className="grid grid-cols-2 gap-1">
            <Link href="/novo" className="col-span-2 rounded-lg bg-honey px-3 py-2 text-center text-sm font-semibold text-pine-deep">
              + Lançar gasto
            </Link>
            {[...links, ...extras].map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className={`rounded-lg px-3 py-2 text-sm font-medium ${
                  pathname === link.href ? "bg-cream/10 text-honey-soft" : "text-cream/75 hover:bg-cream/5"
                }`}
              >
                {link.label}
              </Link>
            ))}
            <button
              onClick={sair}
              className="col-span-2 mt-1 rounded-lg px-3 py-2 text-left text-sm text-cream/60 hover:bg-cream/5"
            >
              Sair
            </button>
          </div>
        </nav>
      )}
    </header>
  );
}
