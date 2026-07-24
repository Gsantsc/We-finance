"use client";

// Registra o service worker. Sem ele o Android nao oferece "Instalar app".
// So roda em producao: em dev o service worker atrapalha o hot reload.

import { useEffect } from "react";

export default function RegistrarSW() {
  useEffect(() => {
    if (process.env.NODE_ENV !== "production") return;
    if (!("serviceWorker" in navigator)) return;

    navigator.serviceWorker.register("/sw.js").catch((e) => {
      console.error("Falha ao registrar o service worker:", e);
    });
  }, []);

  return null;
}
