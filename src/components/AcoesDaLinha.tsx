"use client";

// "Editar · Apagar" - o mesmo par, no mesmo lugar, em todas as telas.
//
// Antes cada tela resolvia do seu jeito: umas so tinham "remover", outras so
// "Editar", e o texto mudava de tela para tela. Quem aprendeu numa nao sabia
// onde clicar na outra. Padrao unico e' o que faz a interface ficar previsivel -
// depois de usar uma vez, todas as outras ja sao conhecidas.
//
// Apagar fica em cor de alerta e SEMPRE passa por confirmacao, escrita em
// textoConfirmarExclusao para nao mudar de tom entre telas: confirmacao que
// varia ensina a clicar no automatico, que e' o oposto do que ela serve.

import { textoConfirmarExclusao } from "@/lib/exclusao";

export default function AcoesDaLinha({
  aoEditar,
  aoApagar,
  tipo,
  nome,
  consequencia,
  ocupado = false,
  rotuloEditar = "Editar",
}: {
  aoEditar?: () => void;
  aoApagar?: () => void | Promise<void>;
  /** "a meta", "a conta" - entra na frase "Apagar a meta \"X\"?" */
  tipo: string;
  nome: string;
  /** O que acontece junto, quando não é óbvio. */
  consequencia?: string;
  ocupado?: boolean;
  rotuloEditar?: string;
}) {
  function confirmarEApagar() {
    if (!aoApagar) return;
    if (!confirm(textoConfirmarExclusao({ tipo, nome, consequencia }))) return;
    void aoApagar();
  }

  return (
    <span className="flex items-center justify-end gap-3 whitespace-nowrap">
      {aoEditar && (
        <button onClick={aoEditar} disabled={ocupado} className="link-honey disabled:opacity-50">
          {rotuloEditar}
        </button>
      )}
      {aoApagar && (
        <button
          onClick={confirmarEApagar}
          disabled={ocupado}
          className="text-sage transition-colors hover:text-clay disabled:opacity-50"
        >
          Apagar
        </button>
      )}
    </span>
  );
}
