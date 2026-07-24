# Instalar o Nossas Finanças como app (PC e celular)

Este guia deixa o app com **ícone próprio** no PC e nos celulares da casa, abrindo
em janela/tela cheia como se fosse um programa instalado — mas continua sendo o
mesmo app rodando no seu computador, sem nuvem nenhuma.

## Por que precisa de "certificado"?

Os navegadores só deixam um site virar app (e funcionar como app no Android) se
o endereço for **https** e for confiável. Na rede de casa não existe uma empresa
que emita esse selo para um endereço tipo `192.168.0.10`. Então a gente cria a
**nossa própria autoridade** (um arquivo `ca.pem`), instala ela uma vez em cada
aparelho, e pronto: aquele aparelho passa a confiar no app. É seguro porque a
chave dessa autoridade nunca sai do seu PC.

> **Resumo rápido do que você vai usar:**
>
> | Comando | Para quê |
> |---|---|
> | `npm run build` | prepara a versão final (uma vez, e a cada atualização) |
> | `npm run certificados` | cria os certificados (uma vez) |
> | `npm run start:https` | liga o app com https |
> | `.\scripts\inicializacao.ps1 -Acao instalar` | faz ligar sozinho com o Windows |

---

## Parte 1 — No PC (uma vez só)

### 1.1 Reserve o IP da máquina no roteador (importante)

O endereço do PC na rede (ex. `192.168.0.10`) pode mudar sozinho. Se mudar, o
certificado e os apps já instalados param de funcionar. Para evitar:

1. Entre no seu roteador (normalmente `192.168.0.1` ou `192.168.1.1` no navegador).
2. Procure por **"Reserva de IP"**, **"DHCP estático"** ou **"Fixar IP"**.
3. Fixe o IP atual do PC pelo nome/MAC dele.

Não sabe o IP atual? No PowerShell:

```powershell
(Get-NetIPAddress -AddressFamily IPv4 | Where-Object { $_.IPAddress -like '192.168.*' }).IPAddress
```

### 1.2 Deixe a rede como "Particular"

Se a Wi-Fi estiver como **Pública**, o Windows bloqueia os celulares. Vá em
**Configurações → Rede e Internet → Wi-Fi → (sua rede) → Tipo de perfil de rede**
e escolha **Particular**. (O comando `status` mais abaixo avisa se estiver errado.)

### 1.3 Gere a versão final e os certificados

Na pasta do projeto:

```bash
npm install
npm run seed
npm run build
npm run certificados
```

O `certificados` cria a pasta `certs/`. Guarde o `certs/ca.pem` — é o arquivo que
você vai instalar nos aparelhos.

### 1.4 Instale a autoridade (ca.pem) no Windows

1. Abra a pasta `certs`, clique com o botão direito em **`ca.pem` → Instalar certificado**.
2. Escolha **Máquina Local** → Avançar (vai pedir permissão de administrador).
3. Marque **"Colocar todos os certificados no repositório a seguir"** → **Procurar**
   → **Autoridades de Certificação Raiz Confiáveis** → OK → Avançar → Concluir.

### 1.5 Ligue o app

```bash
npm run start:https
```

Abra no Edge ou Chrome: **https://localhost:3443** — deve aparecer sem aviso de
"não seguro".

### 1.6 Instale como app no PC

No Edge/Chrome, com o app aberto, clique no ícone de **instalar** na barra de
endereço (ou menu **⋯ → Aplicativos → Instalar este site como aplicativo**).
Vai virar uma janela própria, com ícone no Menu Iniciar e na barra de tarefas.

### 1.7 Faça ligar sozinho com o Windows

Sem isso, o ícone só funciona quando você liga o servidor na mão. Para automatizar:

```powershell
.\scripts\inicializacao.ps1 -Acao instalar
```

- A **tarefa** (subir o servidor no login) **não** precisa de administrador.
- A **regra de firewall** (deixar os celulares entrarem) **precisa**. Se o
  PowerShell não estiver como administrador, o script te mostra o comando exato
  para rodar depois como admin.

Para conferir a qualquer momento: `.\scripts\inicializacao.ps1 -Acao status`
Para desfazer tudo: `.\scripts\inicializacao.ps1 -Acao remover`

---

## Parte 2 — No iPhone / iPad

1. Passe o `certs/ca.pem` para o iPhone (por e-mail para você mesmo, AirDrop, etc.)
   e abra o arquivo. O iPhone diz que um **perfil** foi baixado.
2. **Ajustes → Geral → VPN e Gerenciamento de Dispositivo** → toque no perfil
   "Nossas Financas - CA local" → **Instalar** (pede o código do aparelho).
3. **Passo que todo mundo esquece:** **Ajustes → Geral → Sobre → Configurações de
   Confiança do Certificado** e **ligue** a chave ao lado de "Nossas Financas".
   Sem isso o Safari continua reclamando.
4. No Safari, abra **https://SEU-IP:3443** (ex. `https://192.168.0.10:3443`) e
   faça login.
5. Toque em **Compartilhar** (quadrado com seta) → **Adicionar à Tela de Início**.
   Pronto: o ícone abre em tela cheia.

---

## Parte 3 — No Android

1. Passe o `certs/ca.pem` para o celular.
2. **Configurações → Segurança → Mais configurações de segurança → Criptografia
   e credenciais → Instalar um certificado → Certificado de CA** e escolha o
   arquivo. (O caminho muda um pouco conforme a marca; procure por "Instalar
   certificado" / "Certificado de CA".)
3. O Android vai mostrar um aviso de que **"a rede pode ser monitorada"**. Aqui
   isso é **esperado e inofensivo** — é só porque você instalou uma autoridade
   própria; ela vale só para o seu app, no seu PC.
4. No Chrome, abra **https://SEU-IP:3443** e faça login.
5. Menu **⋮ → Instalar aplicativo** (ou "Adicionar à tela inicial"). Como agora é
   https confiável, ele instala de verdade e abre em tela cheia.

---

## Quando o IP da máquina mudar

Se você seguiu a Parte 1.1 (reserva de IP), não deve mudar. Se mudar mesmo assim:

1. Gere os certificados de novo cobrindo o novo IP:
   ```bash
   npm run certificados -- --forcar
   ```
2. No `.env`, atualize `NEXTAUTH_URL` para o novo endereço.
3. Reinstale o `ca.pem` nos aparelhos (a autoridade mudou).

> Dica: reservar o IP no roteador evita ter que fazer isso.

---

## Solução de problemas

**"Sua conexão não é particular" / cadeado com aviso**
A autoridade (`ca.pem`) não foi instalada nesse aparelho, ou no iPhone faltou
**ligar a confiança** (Parte 2, passo 3).

**O celular não abre nada / "demorou demais"**
1. O PC está ligado e com o app rodando (`status` mostra a tarefa)?
2. A Wi-Fi do PC está como **Particular** (Parte 1.2)?
3. A regra de firewall foi criada (precisa de admin — Parte 1.7)?
4. Celular e PC estão na **mesma rede** wifi?

**Login manda para uma página em branco ou fica em loop**
O `NEXTAUTH_URL` no `.env` precisa ser exatamente o endereço https que você
acessa, ex. `NEXTAUTH_URL="https://192.168.0.10:3443"`. Depois de mudar, reinicie
o app. Se já tinha logado antes com outro endereço, limpe os dados do site nesse
aparelho e entre de novo.

**No Android aparece "Instalar" mas abre no navegador**
Você entrou por http, ou clicou em "prosseguir mesmo assim" num aviso de
certificado. Instale o `ca.pem` (Parte 3) e entre por **https** sem aviso.

**"node.exe nao encontrado" no log**
Falta o Node 22+ no PC. Veja `%LOCALAPPDATA%\nossas-financas\servidor.log`.

**A porta 3443 já está em uso**
Suba com outra porta: defina `HTTPS_PORT` (ex. `4443`) antes de `npm run start:https`
e ajuste o `NEXTAUTH_URL`. Se tiver ligado o start automático, rode
`-Acao remover` e `-Acao instalar` de novo para a regra pegar a porta nova.
