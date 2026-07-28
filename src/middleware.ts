export { default } from "next-auth/middleware";

export const config = {
  matcher: [
    "/dashboard/:path*",
    "/contas/:path*",
    "/transacoes/:path*",
    "/entidades/:path*",
    "/orcamentos/:path*",
    "/metas/:path*",
    "/contas-a-pagar/:path*",
    "/novo/:path*",
    "/importar/:path*",
    "/regras/:path*",
    "/trocar-senha/:path*",
    // Toda rota /api que le dado da casa entra aqui. O requireHousehold() do
    // handler ja barra sozinho, mas deixar a rota fora do matcher tira a camada
    // de fora e faz uma rota nova nascer desprotegida se alguem esquecer a
    // checagem interna.
    "/api/dashboard/:path*",
    "/api/membros/:path*",
    "/api/entidades/:path*",
    "/api/contas/:path*",
    "/api/transacoes/:path*",
    "/api/categorias/:path*",
    "/api/sync/:path*",
    "/api/orcamentos/:path*",
    "/api/metas/:path*",
    "/api/contas-a-pagar/:path*",
    "/api/relatorios/:path*",
    "/api/regras/:path*",
  ],
};
