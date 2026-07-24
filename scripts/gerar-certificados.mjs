// Gera os certificados do HTTPS local, usando o openssl do sistema.
//
// Por que precisa disso: o navegador so libera "instalar como app" (PWA) e o
// service worker num contexto seguro (https). Na rede de casa nao existe uma
// autoridade publica que emita certificado para um IP tipo 192.168.0.10 - entao
// criamos a NOSSA propria autoridade (CA), instalamos ela nos aparelhos uma vez,
// e ela assina o certificado do servidor. A partir dai os aparelhos confiam.
//
// Rode com:  npm run certificados
// Para incluir um IP extra:  npm run certificados -- 192.168.0.20
// Para refazer do zero:      npm run certificados -- --forcar
//
// Saida em certs/:
//   ca.pem / ca-key.pem            -> a autoridade (instale ca.pem nos aparelhos)
//   servidor.pem / servidor-key.pem -> o certificado que o servidor usa
//
// IMPORTANTE: a pasta certs/ e ignorada pelo git (contem chaves privadas).

import { execFileSync } from "node:child_process";
import { writeFileSync, existsSync, mkdirSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";

const CERT_DIR = path.join(process.cwd(), "certs");
const args = process.argv.slice(2);
const forcar = args.includes("--forcar");
const ipsExtra = args.filter((a) => /^\d+\.\d+\.\d+\.\d+$/.test(a));

// ---------- checagens ----------

function temOpenssl() {
  try {
    execFileSync("openssl", ["version"], { stdio: "pipe" });
    return true;
  } catch {
    return false;
  }
}

if (!temOpenssl()) {
  console.error(`
  Nao encontrei o "openssl" nesta maquina.

  Ele costuma vir junto com o Git para Windows (Git Bash). Se voce instalou o
  Git, rode este comando pelo "Git Bash" em vez do PowerShell.
  Conferir:  openssl version
`);
  process.exit(1);
}

// ---------- descobre os enderecos que o certificado deve cobrir ----------

// Pega os IPv4 reais da maquina, ignorando loopback e as placas virtuais
// (WSL, Hyper-V, Docker) - essas nao valem para acessar da rede de casa.
function ipsDaRede() {
  const ignorar = /(vEthernet|WSL|Hyper-V|Loopback|VirtualBox|VMware|Default Switch)/i;
  const achados = [];
  for (const [nome, lista] of Object.entries(os.networkInterfaces())) {
    if (ignorar.test(nome)) continue;
    for (const i of lista || []) {
      if (i.family === "IPv4" && !i.internal) achados.push(i.address);
    }
  }
  return achados;
}

const hostname = os.hostname();
const ips = [...new Set(["127.0.0.1", ...ipsDaRede(), ...ipsExtra])];
const dns = [...new Set(["localhost", hostname, `${hostname}.local`])];

if (ips.length <= 1) {
  console.warn(
    "Aviso: nao achei nenhum IP de rede local (so o 127.0.0.1). Voce esta conectado no wifi?\n" +
      "Da para passar o IP na mao:  npm run certificados -- 192.168.0.10\n"
  );
}

// ---------- nao sobrescrever sem querer ----------

const arquivos = ["ca.pem", "ca-key.pem", "servidor.pem", "servidor-key.pem"];
const jaExiste = arquivos.some((f) => existsSync(path.join(CERT_DIR, f)));

if (jaExiste && !forcar) {
  console.error(`
  Ja existem certificados na pasta certs/.

  Se voce refizer, vai gerar uma CA nova - e ai TODOS os aparelhos onde voce ja
  instalou a CA antiga vao parar de confiar, e voce teria que reinstalar em cada
  um. Normalmente voce NAO quer isso.

  - So o IP da maquina mudou? Voce ainda pode reaproveitar a mesma CA, mas este
    script simples refaz tudo junto. Se for o caso, rode com --forcar e reinstale
    a CA nos aparelhos.
  - Quer mesmo recomecar do zero?  npm run certificados -- --forcar
`);
  process.exit(1);
}

mkdirSync(CERT_DIR, { recursive: true });

// ---------- geracao ----------

function openssl(argumentos, entrada) {
  return execFileSync("openssl", argumentos, {
    cwd: CERT_DIR,
    stdio: entrada ? ["pipe", "pipe", "pipe"] : ["ignore", "pipe", "pipe"],
    input: entrada,
  });
}

console.log("Enderecos que o certificado vai cobrir:");
console.log("  DNS:", dns.join(", "));
console.log("  IP :", ips.join(", "));
console.log("");

// 1) Autoridade (CA): chave + certificado autoassinado, validade longa (10 anos).
console.log("1/4  Criando a autoridade (CA)...");
openssl(["genrsa", "-out", "ca-key.pem", "2048"]);
openssl([
  "req", "-x509", "-new", "-nodes", "-key", "ca-key.pem", "-sha256",
  "-days", "3650", "-out", "ca.pem",
  "-subj", "/CN=Nossas Financas - CA local/O=Nossas Financas",
  "-addext", "basicConstraints=critical,CA:TRUE,pathlen:0",
  "-addext", "keyUsage=critical,keyCertSign,cRLSign",
]);

// 2) Chave do servidor.
console.log("2/4  Criando a chave do servidor...");
openssl(["genrsa", "-out", "servidor-key.pem", "2048"]);

// 3) Pedido (CSR) do servidor.
console.log("3/4  Preparando o certificado do servidor...");
openssl([
  "req", "-new", "-key", "servidor-key.pem", "-out", "servidor.csr",
  "-subj", `/CN=${ips.find((x) => x !== "127.0.0.1") || "localhost"}`,
]);

// Extensoes exigidas pelos navegadores modernos:
// - SAN com os enderecos (o iOS exige SAN; CN sozinho nao vale mais)
// - extendedKeyUsage=serverAuth (o iOS 13+ recusa sem isso)
const san = [
  ...dns.map((d) => `DNS:${d}`),
  ...ips.map((i) => `IP:${i}`),
].join(",");

writeFileSync(
  path.join(CERT_DIR, "extensoes.cnf"),
  [
    "basicConstraints=CA:FALSE",
    "keyUsage=critical,digitalSignature,keyEncipherment",
    "extendedKeyUsage=serverAuth",
    `subjectAltName=${san}`,
    "",
  ].join("\n")
);

// 4) Assina o certificado do servidor com a CA. Validade 398 dias: navegadores
//    recusam certificado de servidor com validade muito longa (~825 dias e o
//    teto; ficamos bem abaixo).
console.log("4/4  Assinando com a CA (validade de 398 dias)...");
openssl([
  "x509", "-req", "-in", "servidor.csr",
  "-CA", "ca.pem", "-CAkey", "ca-key.pem", "-CAcreateserial",
  "-out", "servidor.pem", "-days", "398", "-sha256",
  "-extfile", "extensoes.cnf",
]);

// Limpa os intermediarios que nao sao mais necessarios.
for (const tmp of ["servidor.csr", "extensoes.cnf"]) {
  try { rmSync(path.join(CERT_DIR, tmp)); } catch {}
}

const enderecoPrincipal = ips.find((x) => x !== "127.0.0.1");
const porta = process.env.HTTPS_PORT || "3443";

console.log(`
Pronto! Certificados criados em certs/.

  ca.pem            -> INSTALE este nos aparelhos (PC, iPhone, Android)
  servidor.pem      -> usado pelo servidor (nao precisa mexer)
  *-key.pem         -> chaves privadas, nunca compartilhe

Proximos passos:
  1) Suba o app com HTTPS:   npm run start:https
  2) Acesse de qualquer aparelho da casa:
        https://${enderecoPrincipal || "SEU-IP"}:${porta}
  3) Para o navegador confiar (sem aviso de "nao seguro"), instale o ca.pem:
        - Windows: clique 2x em certs/ca.pem > Instalar > "Maquina Local" >
          "Autoridades de Certificacao Raiz Confiaveis".
        - iPhone/Android: veja o guia em docs/INSTALAR-COMO-APP.md

O passo a passo completo (com as pegadinhas de cada aparelho) esta em:
  docs/INSTALAR-COMO-APP.md
`);
