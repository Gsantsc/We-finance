"use client";

// Registra o service worker. Sem ele o Android nao oferece "Instalar app".
// So roda em producao: em dev o service worker atrapalha o hot reload.

import { useEffect } from "react";

export default function RegistrarSW() {
  useEffect(() => {
    if (process.env.NODE_ENV !== "production") return;
    if (!("serviceWorker" in navigator)) return;

    // So a mensagem: o stack nao ajuda o usuario e polui o console do cliente.
    navigator.serviceWorker.register("/sw.js").catch((e: unknown) => {
      const motivo = e instanceof Error ? e.message : String(e);
      console.warn(`Falha ao registrar o service worker: ${motivo}`);
    });
  }, []);

  return null;
}
