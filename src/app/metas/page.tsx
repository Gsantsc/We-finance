import NavBar from "@/components/NavBar";

export default function MetasPage() {
  return (
    <div>
      <NavBar />
      <main className="mx-auto max-w-6xl px-4 py-16 text-center">
        <h1 className="text-2xl font-semibold">Metas de economia</h1>
        <p className="mt-2 text-slate-500">
          Fase 2 do projeto. O modelo de dados ja existe (tabela Goal) - a tela chega na proxima etapa.
        </p>
      </main>
    </div>
  );
}
