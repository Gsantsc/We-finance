import NavBar from "@/components/NavBar";

export default function ContasAPagarPage() {
  return (
    <div>
      <NavBar />
      <main className="mx-auto max-w-6xl px-4 py-16 text-center">
        <h1 className="text-2xl font-semibold">Contas a pagar</h1>
        <p className="mt-2 text-slate-500">
          Fase 3 do projeto. O modelo de dados ja existe (tabela Bill) - a tela chega na proxima etapa.
        </p>
      </main>
    </div>
  );
}
