# Nossas Finanças

Aplicação **local** de controle financeiro para o casal — feita para organizar,
no mesmo lugar, as contas **da Casa**, as **Pessoais** de cada um e as **PJ**
de cada um. Puxa saldos e extratos automaticamente via **Open Finance** (Pluggy /
Meu Pluggy) e também aceita lançamentos manuais.

Roda inteiramente na sua máquina: os dados ficam num único arquivo SQLite, nada
vai para nuvem nenhuma.

---

## Índice

1. [Como funciona a organização (Casa / Pessoal / PJ)](#1-como-funciona-a-organização)
2. [O que você precisa antes de começar](#2-o-que-você-precisa-antes-de-começar)
3. [Passo A — Conectar os bancos no Meu Pluggy](#3-passo-a--conectar-os-bancos-no-meu-pluggy)
4. [Passo B — Pegar as credenciais no Dashboard Pluggy](#4-passo-b--pegar-as-credenciais-no-dashboard-pluggy)
5. [Passo C — Configurar o arquivo .env](#5-passo-c--configurar-o-env)
6. [Passo D — Rodar o app](#6-passo-d--rodar-o-app)
7. [Passo E — Primeiro uso](#7-passo-e--primeiro-uso)
8. [Acessar de outros aparelhos na rede de casa](#8-acessar-de-outros-aparelhos-na-rede-de-casa)
9. [Backup dos dados](#9-backup-dos-dados)
10. [Segurança](#10-segurança)
11. [O que já está pronto e o que vem nas próximas fases](#11-roadmap)
12. [Solução de problemas](#12-solução-de-problemas)

---

## 1. Como funciona a organização

Tudo gira em torno de **Entidades**. Uma entidade é um "livro" onde as contas
ficam agrupadas. Existem três tipos:

- **Casa** — o que é compartilhado entre vocês dois (conta conjunta, cartão da casa…).
- **Pessoal** — de cada um individualmente (uma entidade Pessoal para você, outra para sua esposa).
- **PJ** — a empresa de cada um (um PJ para você, outro para ela, quantos precisar).

O seed inicial já cria: `Casa`, `Pessoal - <você>`, `Pessoal - <esposa>` e `PJ - <você>`.
Você pode criar/editar quantas entidades quiser na tela **Entidades**.

Cada **Conta** bancária (corrente, poupança, cartão, investimento, dinheiro em
espécie) pertence a uma entidade. Quando o app sincroniza com a Pluggy, as contas
chegam **sem entidade definida** — você classifica cada uma como Casa, Pessoal ou
PJ na tela **Contas**. Assim uma mesma conexão de banco pode ter contas separadas
por finalidade.

---

## 2. O que você precisa antes de começar

- **Node.js 22 ou superior** instalado (o app usa o SQLite embutido do Node 22).
  Baixe em https://nodejs.org (versão LTS). Confira com: `node -v`.
- **OU Docker** instalado (alternativa que não exige Node na máquina).
- Contas bancárias que participam do Open Finance (praticamente todos os bancos).
- ~15 minutos para o cadastro inicial na Pluggy.

> **Por que Pluggy?** O "Meu Pluggy" oferece a API de Open Finance **gratuita para
> uso pessoal**, sem prazo de expiração e sem limite de contas próprias, e é
> regulada pelo Banco Central. É o jeito de ter Open Finance de verdade sem custo.

---

## 3. Passo A — Conectar os bancos no Meu Pluggy

1. Acesse **https://meu.pluggy.ai** e crie uma conta (e-mail + senha).
2. Clique em **"Conectar Minha Conta"** e adicione cada banco que quer acompanhar
   (pessoais e PJ). Você faz o login/consentimento no próprio banco — só vocês
   conseguem fazer essa parte.
3. Repita para cada banco/conta (seus, da esposa, das empresas).

## 4. Passo B — Pegar as credenciais no Dashboard Pluggy

1. Acesse **https://dashboard.pluggy.ai** e crie uma conta.
2. Crie **uma Application** (uma só já basta para tudo).
3. Copie o **Client ID** e o **Client Secret** dessa Application.
4. Ainda no Dashboard, dentro da Application, escolha o conector **"Meu Pluggy"**,
   faça login com a conta do Meu Pluggy e **autorize cada conta** que você conectou
   no Passo A. (Sempre que conectar um banco novo no Meu Pluggy, repita este passo
   para vinculá-lo aqui.)

> O Dashboard mostra um "teste de 15 dias", mas isso vale só para recursos
> comerciais. Para uso pessoal via Meu Pluggy, **continua gratuito sem prazo**.

## 5. Passo C — Configurar o .env

Na pasta do projeto, copie o arquivo de exemplo e preencha:

```bash
cp .env.example .env
```

Abra o `.env` e preencha:

- `NEXTAUTH_SECRET` — uma chave aleatória. Gere com:
  ```bash
  node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
  ```
- `PLUGGY_CLIENT_ID` e `PLUGGY_CLIENT_SECRET` — do Passo B.
- `USER1_*` e `USER2_*` — nome, e-mail e **senha** de cada um de vocês (é o login do app).
- `NEXTAUTH_URL` — deixe `http://localhost:3000` por enquanto (veja a seção 8 para acesso em rede).

## 6. Passo D — Rodar o app

### Opção 1 — Com Node (recomendada para o dia a dia)

```bash
npm install       # instala as dependências (uma vez)
npm run seed      # cria os usuários, entidades e categorias iniciais
npm run build     # gera a versão de produção
npm run start     # sobe o app em http://localhost:3000
```

Depois da primeira vez, para usar de novo basta `npm run start`.
Para desenvolver com recarga automática: `npm run dev`.

### Opção 2 — Com Docker (não precisa de Node instalado)

```bash
docker compose up -d --build
```

O app sobe em `http://localhost:3000`. O banco fica salvo na pasta `./data`
(mapeada para dentro do contêiner), então seus dados sobrevivem a reinícios.
Para parar: `docker compose down`.

## 7. Passo E — Primeiro uso

1. Abra `http://localhost:3000` e faça **login** com um dos usuários do `.env`.
2. Clique em **"Sincronizar com Pluggy"** no Painel. As contas e transações são
   puxadas para o banco local.
3. Vá em **Contas**: as contas sincronizadas aparecem num aviso amarelo
   ("sem entidade definida"). Classifique cada uma como Casa, Pessoal ou PJ.
4. Pronto — o Painel passa a mostrar o **patrimônio total** e o saldo agrupado por
   Casa / Pessoal / PJ, além das últimas transações.
5. Precisa lançar algo que não vem do banco (dinheiro em espécie, um acerto)?
   Use **Nova conta manual** e **Nova transação**.

> **Como os saldos se comportam**
> - **Conta manual** (carteira, dinheiro em espécie): o saldo é atualizado sozinho
>   a cada lançamento — você põe o saldo inicial e depois só registra as transações.
> - **Conta da Pluggy**: o saldo vem do próprio banco a cada sincronização; os
>   lançamentos não mexem nele.
> - **Cartão de crédito**: a Pluggy devolve a fatura como valor devido. O app
>   guarda esse valor **negativo**, para a dívida diminuir o patrimônio em vez de
>   aumentar.
> - O **patrimônio total** do Painel soma só o que está dentro de alguma entidade.
>   Conta ainda sem classificação aparece num aviso e fica fora do total.

> Dica: clique em "Sincronizar" quando quiser atualizar os dados. Dá para
> automatizar isso depois.

---

## 8. Acessar de outros aparelhos e instalar como app

O app funciona de três formas com o **mesmo código**: janela própria no PC, site
no navegador e ícone (tela cheia) no celular. Para o PC e o iPhone dá para usar
em `http` simples; o **Android** exige `https`, e é por isso que existe o passo
dos certificados.

### Jeito rápido (só ver no navegador de outro aparelho, sem instalar)

1. Descubra o **IP local**: no Windows, `ipconfig` (procure "Endereço IPv4").
2. No `.env`, troque `NEXTAUTH_URL` para esse IP, ex:
   `NEXTAUTH_URL="http://192.168.0.10:3000"`
3. Rode aceitando conexões da rede:
   ```bash
   npm run build
   npx next start -H 0.0.0.0 -p 3000
   ```
4. Nos outros aparelhos, acesse `http://192.168.0.10:3000`.

> Se não abrir, provavelmente é o **firewall** bloqueando a porta — libere-a para
> a rede local.

### Instalar como app de verdade (ícone no PC e no celular, com https)

Isso deixa o app com ícone próprio, abrindo em janela/tela cheia, e permite a
instalação no Android. Passo a passo completo, com as pegadinhas de cada aparelho:

**➡️ [docs/INSTALAR-COMO-APP.md](docs/INSTALAR-COMO-APP.md)**

Em resumo, uma vez só:

```bash
npm run build            # versão final
npm run certificados     # cria os certificados do https local (pasta certs/)
npm run start:https      # sobe o app em https://SEU-IP:3443
```

E, opcionalmente, para o servidor subir sozinho junto com o Windows:

```powershell
.\scripts\inicializacao.ps1 -Acao instalar
```

> Ao usar https, **todos** os aparelhos (inclusive o PC) acessam pelo mesmo
> endereço (`https://SEU-IP:3443`) e o `.env` fica com
> `NEXTAUTH_URL="https://SEU-IP:3443"`. O guia explica por quê.

---

## 9. Backup dos dados

Tudo fica em **um único arquivo**. Por padrão ele fica **fora do OneDrive** (para
a sincronização na nuvem não corromper o banco enquanto o app escreve nele):

- **Windows:** `%LOCALAPPDATA%\nossas-financas\app.db`
  (normalmente `C:\Users\SEU-USUARIO\AppData\Local\nossas-financas\app.db`)
- **Outros / Docker:** `./data/app.db`

> Se você já tinha um banco na antiga pasta `data/`, o app **move sozinho** para o
> novo local na primeira vez que roda — sem perder nada.

Para fazer backup, copie esse arquivo (com o app parado, de preferência). No
Windows (PowerShell):

```powershell
Copy-Item "$env:LOCALAPPDATA\nossas-financas\app.db" "$HOME\Desktop\backup-financas-$(Get-Date -Format yyyyMMdd).db"
```

Guarde a cópia num lugar seguro (pen drive, HD externo). Restaurar = colocar o
arquivo de volta no mesmo caminho.

> Quer manter o banco noutro lugar? Defina `DATABASE_PATH` no `.env` com o caminho
> que preferir.

---

## 10. Segurança

- Dado financeiro é sensível, **mesmo rodando local**. Use **senhas fortes** no
  login (campos `USER*_PASSWORD` do `.env`).
- **Nunca** compartilhe nem versione o arquivo `.env` — ele contém o
  `PLUGGY_CLIENT_SECRET` e as senhas. O `.gitignore` já ignora `.env` e `data/`.
- As senhas dos usuários são guardadas com **hash bcrypt** (não em texto puro).
- Mantenha o app acessível só na **rede local**. Não exponha a porta 3000 para a
  internet sem uma camada extra de proteção (VPN, proxy com autenticação etc.).
- Pelo Open Finance você pode **revogar** o acesso da Pluggy a qualquer conta
  quando quiser, direto no seu banco ou no Meu Pluggy.

---

## 11. Roadmap

**Pronto agora (Fase 1):**
- Login individual para você e sua esposa.
- Organização Casa / Pessoal / PJ com entidades ilimitadas.
- Sincronização automática de contas e transações via Pluggy (Open Finance).
- Classificação das contas sincronizadas por entidade.
- Contas e transações manuais.
- Painel com patrimônio total, saldo por entidade e últimas transações.
- Categorias (as suas + as que a Pluggy sugere entram sozinhas no sync).

**Já modelado no banco, telas nas próximas fases:**
- **Fase 2:** Orçamento por categoria (tabela `budgets`) e Metas de economia (`goals`).
- **Fase 3:** Contas a pagar / lembretes de vencimento (`bills`).
- **Fase 4:** Relatórios e gráficos (evolução patrimonial, comparativo mensal).

As telas dessas seções já existem no menu, marcadas como "próxima etapa".

---

## 12. Solução de problemas

**`npm run seed` ou o app reclama de SQLite / "node:sqlite"**
Você está num Node antigo. Instale o **Node 22.5+** (`node -v` para conferir).
Os comandos `dev`, `build`, `start` e `seed` checam a versão antes de rodar e
avisam com essa mensagem — se aparecer, é isso mesmo.

**A sincronização retorna erro de credenciais**
Confira `PLUGGY_CLIENT_ID` / `PLUGGY_CLIENT_SECRET` no `.env` e se você vinculou as
contas à Application no Dashboard (Passo B, item 4).

**Sincronizou mas nenhuma conta aparece**
Verifique no **Meu Pluggy** se os bancos estão conectados e, no **Dashboard**, se
foram autorizados dentro da sua Application. Cada banco novo precisa ser vinculado lá.

**Os nomes dos campos da Pluggy mudaram**
A integração fica em `src/lib/pluggy.ts`, com comentários indicando onde ajustar
caso a API mude algum nome de campo. Rode uma sincronização e cheque o console.

**Esqueci a senha de login**
Edite a senha no `.env` (`USER1_PASSWORD` / `USER2_PASSWORD`) e rode `npm run seed`
de novo — ele atualiza os usuários existentes.

---

## Estrutura do projeto (para quem quiser mexer no código)

```
nossas-financas/
├─ src/
│  ├─ app/                 # páginas e rotas de API (Next.js App Router)
│  │  ├─ api/              # /entidades /contas /transacoes /categorias /sync /auth
│  │  ├─ dashboard/        # painel geral
│  │  ├─ contas/           # contas + classificação por entidade
│  │  ├─ transacoes/       # lançamentos
│  │  ├─ entidades/        # Casa / Pessoal / PJ
│  │  └─ (orcamentos, metas, contas-a-pagar)  # próximas fases
│  ├─ lib/
│  │  ├─ db.ts             # SQLite embutido + criação das tabelas
│  │  ├─ repo.ts           # funções de acesso ao banco
│  │  ├─ auth.ts           # NextAuth (login por e-mail/senha)
│  │  ├─ api.ts            # sessão + validação + erro padronizado das rotas
│  │  ├─ schemas.ts        # regras de validação (zod) dos corpos de requisição
│  │  ├─ http.ts           # cliente das telas (mostra o erro que a API devolve)
│  │  └─ pluggy.ts         # integração Open Finance
│  ├─ components/          # navbar, banner de erro, registro do service worker
│  └─ app/globals.css      # ajustes de PWA (tela cheia, notch do iPhone)
├─ public/                 # manifest, ícones e service worker do app instalável
├─ docs/INSTALAR-COMO-APP.md  # guia passo a passo de instalar no PC e celular
├─ scripts/seed.ts         # usuários, entidades e categorias iniciais
├─ scripts/check-node.mjs  # avisa se o Node for anterior ao 22.5
├─ scripts/gerar-icones.mjs        # gera os ícones do app (npm run icones)
├─ scripts/gerar-certificados.mjs  # certificados do https local (npm run certificados)
├─ scripts/servidor-https.mjs      # sobe o app em https (npm run start:https)
├─ scripts/inicializacao.ps1       # liga/desliga o start automático no Windows
├─ scripts/win/            # lançadores usados pelo start automático
├─ certs/                  # certificados gerados (ignorado pelo git)
├─ (banco)                 # %LOCALAPPDATA%\nossas-financas\app.db no Windows,
│                          # ./data/app.db nos demais — faça backup dele (seção 9)
├─ Dockerfile / docker-compose.yml
└─ .env                    # suas credenciais (NÃO compartilhar)
```

**Stack:** Next.js 15 + React 18, NextAuth (login local), SQLite embutido do
Node 22 (sem dependências nativas), Tailwind CSS. Tudo offline-first.
