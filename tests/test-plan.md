# Plano de testes — nossas-financas

## Fluxos críticos e risco

| Fluxo | Risco se falhar | Camada |
|---|---|---|
| Autorização das rotas de API (sem sessão → 401) | Vazamento de dados financeiros entre usuários/dispositivos | API |
| Contas a pagar: status de vencimento (`billStatus`) | Conta vencida não avisa o usuário, ou avisa errado | Unit |
| Contas a pagar: criar / marcar como paga / remover | Dado financeiro perdido ou lançamento duplicado | API |
| Metas: depósito incremental (`nextGoalAmount`) | Saldo da meta fica negativo ou incorreto | Unit |
| Metas: criar / depositar / remover | Depósito não é gravado ou é gravado no id errado | API |
| Orçamentos: cálculo de percentual gasto e cor do alerta | Usuário não percebe que estourou o orçamento | Unit |
| Orçamentos: criar/atualizar (upsert) / remover | Orçamento duplicado no mesmo mês, ou não atualiza | API |
| Validação de entrada (schemas Zod) nos 3 domínios acima | Dado inválido (dia 32, mês 13, valor negativo/NaN) é gravado no banco | Unit |

## Divisão da pirâmide

- **Unit** (`tests/unit`): toda regra de negócio pura, extraída para `src/lib/rules.ts` — datas de vencimento, cálculo de depósito, percentuais, cor do alerta, ordenação. Rodam sem banco e sem rede; é a camada mais barata e onde a maioria dos casos de contorno (boundary) vive.
- **API** (`tests/api`): contrato de cada rota — autorização (matriz sessão × recurso), dispatch create/update, validação de corpo, casos de erro (id ausente/inexistente). `repo.ts` é mockado; não toca no SQLite real.
- **E2E**: reservado para jornadas que atravessam UI + API + banco de fato (ex: logar, cadastrar uma conta a pagar, marcar como paga e ver o total do mês atualizar). Ver observação de escopo abaixo.

## Fora de escopo (por ora)

- Sincronização com a Pluggy (`/api/sync`) e páginas de contas/transações/entidades pré-existentes — não fazem parte da mudança revisada nesta rodada.
- Rate limiting de login e isolamento de dados por `entityId`/usuário — achados do revisor-seguranca que são decisão de produto, não de teste.
- Testes de carga/performance.
- E2E com Playwright: depende de decisão sobre instalar a dependência e definir usuário de teste seedado — tratado à parte.

## Suítes e tags

- `@smoke` — checagem rápida de autorização (401 sem sessão) e leitura básica; deve rodar em todo PR.
- `@critical` — mutações que gravam ou apagam dinheiro do usuário (criar/atualizar/remover conta a pagar, meta, orçamento).
- `@regression` — casos de contorno e regras de negócio (datas, percentuais, validação de schema).

Filtrar localmente: `npx vitest run -t @smoke` (ou `@critical`, `@regression`).
