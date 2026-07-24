// Service worker do app.
//
// Proposito: deixar o app instalavel (Android exige um service worker com
// handler de fetch) e dar uma tela decente quando o servidor de casa estiver
// desligado. NAO e cache de dado financeiro:
//
// - /api/*        -> nunca passa por cache. Saldo tem que vir do servidor.
// - /_next/static -> cache primeiro (nome do arquivo tem hash, nunca muda).
// - resto         -> rede primeiro, e so se a rede falhar mostra o offline.
//
// Consequencia: nada de saldo ou pagina logada fica guardado no aparelho.

const CACHE = "nossas-financas-v1";
const OFFLINE = "/offline.html";

self.addEventListener("install", (evento) => {
  evento.waitUntil(
    caches
      .open(CACHE)
      .then((c) => c.addAll([OFFLINE, "/icone-192.png"]))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (evento) => {
  evento.waitUntil(
    caches
      .keys()
      .then((chaves) => Promise.all(chaves.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (evento) => {
  const req = evento.request;
  if (req.method !== "GET") return;

  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  // Dado financeiro e sessao: sempre da rede, sem copia local.
  if (url.pathname.startsWith("/api/")) return;

  // Arquivos estaticos do Next tem hash no nome: pode servir do cache.
  if (url.pathname.startsWith("/_next/static/")) {
    evento.respondWith(
      caches.match(req).then(
        (achou) =>
          achou ||
          fetch(req).then((res) => {
            const copia = res.clone();
            caches.open(CACHE).then((c) => c.put(req, copia));
            return res;
          })
      )
    );
    return;
  }

  // Paginas: rede primeiro. Se o servidor de casa estiver fora, avisa.
  evento.respondWith(
    fetch(req).catch(() =>
      caches.match(req).then((achou) => achou || caches.match(OFFLINE))
    )
  );
});
