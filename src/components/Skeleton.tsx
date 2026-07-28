// Placeholders de carregamento. Regra: skeleton so na PRIMEIRA carga da tela.
// Em recarga (trocar de mes, salvar algo) o conteudo anterior fica no lugar com
// opacidade reduzida - piscar um esqueleto sobre dado que ja existe da a
// sensacao de que a tela quebrou, e ainda pula o layout.

// bg-pine/8 sobre o cream ficava praticamente invisivel - a tela lia como vazia,
// que e' exatamente o que o estado de carregando deveria evitar.
export function SkeletonLinha({ className = "" }: { className?: string }) {
  return <div className={`animate-pulse rounded-md bg-pine/15 ${className}`} />;
}

export function SkeletonCard() {
  return (
    <div className="card p-5">
      <SkeletonLinha className="h-3 w-24" />
      <SkeletonLinha className="mt-3 h-8 w-32" />
      <SkeletonLinha className="mt-2 h-3 w-40" />
    </div>
  );
}

export function SkeletonCards({ n = 4 }: { n?: number }) {
  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
      {Array.from({ length: n }, (_, i) => (
        <SkeletonCard key={i} />
      ))}
    </div>
  );
}

export function SkeletonTabela({ linhas = 4 }: { linhas?: number }) {
  return (
    <div className="card p-5">
      <SkeletonLinha className="h-3 w-32" />
      <div className="mt-4 space-y-3">
        {Array.from({ length: linhas }, (_, i) => (
          <SkeletonLinha key={i} className="h-9 w-full" />
        ))}
      </div>
    </div>
  );
}

// Envolve conteudo que esta sendo recarregado: mantem o que ja estava na tela,
// so esmaecido e sem aceitar clique enquanto a resposta nao chega.
export function Recarregando({
  ativo,
  children,
}: {
  ativo: boolean;
  children: React.ReactNode;
}) {
  return (
    <div
      aria-busy={ativo}
      className={ativo ? "pointer-events-none opacity-50 transition-opacity" : "transition-opacity"}
    >
      {children}
    </div>
  );
}
