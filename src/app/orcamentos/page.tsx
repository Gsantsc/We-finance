import NavBar from "@/components/NavBar";

export default function OrcamentosPage() {
  return (
    <div>
      <NavBar />
      <main className="mx-auto max-w-6xl px-4 py-16 text-center">
        <h1 className="text-2xl font-semibold">Orcamentos</h1>
        <p className="mt-2 text-slate-500">
          Fase 2 do projeto. O modelo de dados ja existe (tabela Budget) - a tela chega na proxima etapa.
        </p>
      </main>
    </div>
  );
}
