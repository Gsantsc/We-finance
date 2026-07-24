// Faixa vermelha simples para mostrar erro vindo da API nas telas.

export default function ErroBanner({ mensagem }: { mensagem: string }) {
  if (!mensagem) return null;
  return (
    <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
      {mensagem}
    </div>
  );
}
