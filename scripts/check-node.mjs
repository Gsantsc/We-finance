// Roda antes de dev/build/start/seed. O app usa o SQLite embutido do Node
// (node:sqlite), que so existe a partir do Node 22.5. Sem esta checagem o erro
// que aparece e um "ERR_UNKNOWN_BUILTIN_MODULE: node:sqlite" bem confuso.

const MIN = [22, 5, 0];
const current = process.versions.node.split(".").map(Number);

const olderThanMin =
  current[0] < MIN[0] || (current[0] === MIN[0] && current[1] < MIN[1]);

if (olderThanMin) {
  console.error(`
  Node ${process.versions.node} nao serve para este projeto.

  O app guarda tudo no SQLite embutido do Node (modulo "node:sqlite"),
  que so existe no Node 22.5 ou superior.

  Como resolver (escolha um):
    1) Instale o Node 22 LTS em https://nodejs.org e rode de novo.
    2) Rode por Docker, que ja vem com o Node certo:  docker compose up -d --build

  Depois de instalar, confira com:  node -v
`);
  process.exit(1);
}
