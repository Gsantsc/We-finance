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
    "/trocar-senha/:path*",
    "/api/entidades/:path*",
    "/api/contas/:path*",
    "/api/transacoes/:path*",
    "/api/categorias/:path*",
    "/api/sync/:path*",
    "/api/orcamentos/:path*",
    "/api/metas/:path*",
    "/api/contas-a-pagar/:path*",
    "/api/relatorios/:path*",
  ],
};
