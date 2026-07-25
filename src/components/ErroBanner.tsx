// Aviso de erro vindo da API nas telas.

export default function ErroBanner({ mensagem }: { mensagem: string }) {
  if (!mensagem) return null;
  return (
    <div className="flex items-start gap-2 rounded-xl border border-clay/25 bg-clay/8 px-4 py-3 text-sm text-clay">
      <span aria-hidden className="mt-0.5 select-none">⚠</span>
      <span>{mensagem}</span>
    </div>
  );
}
