// Sobe o app por HTTPS na rede local.
//
// Por que existe: o "next start" so fala HTTP. Para o celular instalar como app
// (e para o service worker funcionar) o navegador exige HTTPS. Aqui a gente pega
// o proprio Next e serve ele dentro de um servidor HTTPS, num processo so - sem
// proxy no meio, entao o endereco que o app enxerga e exatamente o que o
// aparelho digitou (isso importa para o login, que confere a origem).
//
// Rode com:  npm run start:https
// Antes, uma vez:  npm run build  e  npm run certificados
//
// Portas (da para trocar por variavel de ambiente):
//   HTTPS_PORT  (padrao 3443)  -> onde o app responde
//   HTTP_PORT   (padrao 3080)  -> so redireciona quem esquecer o "https://"

import { createServer as createHttpsServer } from "node:https";
import { createServer as createHttpServer } from "node:http";
import { readFileSync, existsSync } from "node:fs";
import path from "node:path";
import os from "node:os";
import { parse } from "node:url";
// @next/env e next sao modulos CommonJS: importa como default e desestrutura.
import nextEnv from "@next/env";
import nextImport from "next";

const { loadEnvConfig } = nextEnv;
const next = typeof nextImport === "function" ? nextImport : nextImport.default;

const raiz = process.cwd();

// Carrega o .env do mesmo jeito que o Next carrega, para NEXTAUTH_URL e afins
// ja estarem disponiveis.
loadEnvConfig(raiz);

const HTTPS_PORT = Number(process.env.HTTPS_PORT || 3443);
const HTTP_PORT = Number(process.env.HTTP_PORT || 3080);

// ---------- certificados ----------

const certDir = path.join(raiz, "certs");
const certFile = path.join(certDir, "servidor.pem");
const keyFile = path.join(certDir, "servidor-key.pem");

if (!existsSync(certFile) || !existsSync(keyFile)) {
  console.error(`
  Faltam os certificados do HTTPS (certs/servidor.pem e certs/servidor-key.pem).

  Gere uma vez com:  npm run certificados
`);
  process.exit(1);
}

let credenciais;
try {
  credenciais = { cert: readFileSync(certFile), key: readFileSync(keyFile) };
} catch (e) {
  console.error("Nao consegui ler os certificados:", e.message);
  process.exit(1);
}

// ---------- avisos uteis de configuracao ----------

const url = process.env.NEXTAUTH_URL || "";
if (!url.startsWith("https://")) {
  console.warn(
    `\n  Aviso: NEXTAUTH_URL no .env esta como "${url || "(vazio)"}".\n` +
      `  Para o login funcionar nos aparelhos, deixe algo como:\n` +
      `      NEXTAUTH_URL="https://${ipDaRede() || "SEU-IP"}:${HTTPS_PORT}"\n`
  );
}

// ---------- Next ----------

const app = next({ dev: false, dir: raiz });

// prepare() precisa vir ANTES de pegar os handlers, senao o Next reclama.
await app.prepare();

const handle = app.getRequestHandler();
// Trata "upgrade" (websocket). Este app nao usa, mas se um dia usar, ja funciona.
const upgrade =
  typeof app.getUpgradeHandler === "function" ? app.getUpgradeHandler() : null;

const servidor = createHttpsServer(credenciais, (req, res) => {
  // Se o socket cair no meio (celular saiu do wifi), nao derruba o processo.
  res.on("error", (e) => console.error("Erro na resposta:", e.message));
  handle(req, res, parse(req.url || "/", true));
});

servidor.on("upgrade", (req, socket, head) => {
  if (upgrade) upgrade(req, socket, head);
  else socket.destroy();
});

// Erros de socket (TLS abortado, etc.) nao devem matar o servidor.
servidor.on("clientError", (err, socket) => {
  if (socket.writable) socket.end("HTTP/1.1 400 Bad Request\r\n\r\n");
});
servidor.on("error", (e) => {
  if (e.code === "EADDRINUSE") {
    console.error(`\n  A porta ${HTTPS_PORT} ja esta em uso. Feche o outro servidor ou troque HTTPS_PORT.\n`);
    process.exit(1);
  }
  console.error("Erro no servidor:", e.message);
});

servidor.listen(HTTPS_PORT, "0.0.0.0", () => {
  const ip = ipDaRede();
  console.log(`
  Nossas Financas rodando por HTTPS.

    Neste PC:        https://localhost:${HTTPS_PORT}
    Na rede de casa: https://${ip || "SEU-IP"}:${HTTPS_PORT}

  (A primeira vez em cada aparelho pede para confiar no certificado - veja
   docs/INSTALAR-COMO-APP.md.)

  Para parar: Ctrl+C
`);
});

// Redireciona quem digitar "http://..." para o https, para nao dar erro seco.
const redir = createHttpServer((req, res) => {
  const host = (req.headers.host || "").split(":")[0];
  res.writeHead(308, { Location: `https://${host}:${HTTPS_PORT}${req.url || "/"}` });
  res.end();
});
redir.on("error", () => {}); // se a porta de redirecionamento estiver ocupada, ignora
redir.listen(HTTP_PORT, "0.0.0.0");

// ---------- encerra direito ----------

function encerrar() {
  console.log("\nEncerrando...");
  servidor.close();
  redir.close();
  process.exit(0);
}
process.on("SIGINT", encerrar);
process.on("SIGTERM", encerrar);

// ---------- utilidades ----------

function ipDaRede() {
  const ignorar = /(vEthernet|WSL|Hyper-V|Loopback|VirtualBox|VMware|Default Switch)/i;
  for (const [nome, lista] of Object.entries(os.networkInterfaces())) {
    if (ignorar.test(nome)) continue;
    for (const i of lista || []) {
      if (i.family === "IPv4" && !i.internal) return i.address;
    }
  }
  return null;
}
