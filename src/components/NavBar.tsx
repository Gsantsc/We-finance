"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { signOut, useSession } from "next-auth/react";

const links = [
  { href: "/dashboard", label: "Painel" },
  { href: "/novo", label: "+ Gasto" },
  { href: "/contas", label: "Contas" },
  { href: "/transacoes", label: "Transacoes" },
  { href: "/orcamentos", label: "Orcamentos" },
  { href: "/metas", label: "Metas" },
  { href: "/contas-a-pagar", label: "Contas a pagar" },
  { href: "/entidades", label: "Entidades" },
];

export default function NavBar() {
  const pathname = usePathname();
  const router = useRouter();
  const { data: session } = useSession();

  // Faz o logout e volta para o login pela mesma origem em que o usuario esta.
  // Se deixassemos o NextAuth redirecionar sozinho (redirect padrao), ele usaria
  // o endereco fixo do NEXTAUTH_URL - o que jogaria o celular para o "localhost"
  // do proprio aparelho. Com redirect:false + router.push, o retorno acompanha
  // quem esta acessando (PC ou celular).
  async function sair() {
    await signOut({ redirect: false });
    router.push("/login");
  }

  return (
    <header className="border-b border-slate-200 bg-white">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-4 px-4 py-3">
        <div className="flex flex-wrap items-center gap-1">
          {links.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className={`rounded-md px-3 py-1.5 text-sm font-medium ${
                pathname === link.href
                  ? "bg-indigo-50 text-indigo-700"
                  : "text-slate-600 hover:bg-slate-100"
              }`}
            >
              {link.label}
            </Link>
          ))}
        </div>
        <div className="flex items-center gap-3 text-sm text-slate-600">
          {session?.user?.name && <span>Ola, {session.user.name}</span>}
          <button
            onClick={sair}
            className="text-slate-500 hover:text-slate-800"
          >
            Sair
          </button>
        </div>
      </div>
    </header>
  );
}
