// Integracao com a API da Pluggy (Open Finance Brasil).
//
// Fluxo pessoal ("Meu Pluggy"): voce conecta os bancos em meu.pluggy.ai,
// depois vincula essas contas a uma Application em dashboard.pluggy.ai.
// O Client ID / Client Secret dessa Application vao no .env.
//
// IMPORTANTE: os nomes exatos de campos abaixo seguem a documentacao publica
// da Pluggy (docs.pluggy.ai) no momento em que este projeto foi escrito.
// Como isso nao pode ser testado sem credenciais reais, confira a resposta
// de /items, /accounts e /transactions no primeiro sync e ajuste este
// arquivo se algum campo tiver mudado de nome.

const PLUGGY_BASE_URL = "https://api.pluggy.ai";

let cachedApiKey: { key: string; expiresAt: number } | null = null;

async function getApiKey(): Promise<string> {
  const clientId = process.env.PLUGGY_CLIENT_ID;
  const clientSecret = process.env.PLUGGY_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    throw new Error(
      "PLUGGY_CLIENT_ID / PLUGGY_CLIENT_SECRET nao configurados no .env. Veja o README."
    );
  }

  if (cachedApiKey && cachedApiKey.expiresAt > Date.now()) {
    return cachedApiKey.key;
  }

  const res = await fetch(`${PLUGGY_BASE_URL}/auth`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ clientId, clientSecret }),
  });

  if (!res.ok) {
    throw new Error(`Falha ao autenticar na Pluggy (${res.status}): ${await res.text()}`);
  }

  const data = await res.json();
  // O token dura algumas horas segundo a documentacao da Pluggy; renovamos com folga.
  cachedApiKey = { key: data.apiKey, expiresAt: Date.now() + 100 * 60 * 1000 };
  return data.apiKey;
}

async function pluggyFetch(path: string) {
  const apiKey = await getApiKey();
  const res = await fetch(`${PLUGGY_BASE_URL}${path}`, {
    headers: { "X-API-KEY": apiKey },
    cache: "no-store",
  });
  if (!res.ok) {
    throw new Error(`Erro na chamada Pluggy ${path} (${res.status}): ${await res.text()}`);
  }
  return res.json();
}

export type PluggyItem = {
  id: string;
  status: string;
  connector?: { name?: string };
};

export type PluggyAccount = {
  id: string;
  itemId: string;
  type: string;
  subtype?: string;
  name: string;
  balance: number;
  currencyCode?: string;
};

export type PluggyTransaction = {
  id: string;
  accountId: string;
  description: string;
  amount: number;
  date: string;
  category?: string;
};

export async function listItems(): Promise<PluggyItem[]> {
  const data = await pluggyFetch("/items");
  return data.results ?? data;
}

export async function listAccounts(itemId: string): Promise<PluggyAccount[]> {
  const data = await pluggyFetch(`/accounts?itemId=${itemId}`);
  return data.results ?? data;
}

export async function listTransactions(
  accountId: string,
  fromDate?: string
): Promise<PluggyTransaction[]> {
  const from = fromDate ? `&from=${fromDate}` : "";
  let page = 1;
  let all: PluggyTransaction[] = [];

  while (true) {
    const data = await pluggyFetch(
      `/transactions?accountId=${accountId}${from}&page=${page}&pageSize=200`
    );
    const results: PluggyTransaction[] = data.results ?? [];
    all = all.concat(results);
    if (!data.totalPages || page >= data.totalPages) break;
    page += 1;
  }

  return all;
}

export function mapAccountType(
  type: string,
  subtype?: string
): "CORRENTE" | "POUPANCA" | "CARTAO" | "INVESTIMENTO" | "DINHEIRO" | "OUTRO" {
  const t = (type || "").toUpperCase();
  const s = (subtype || "").toUpperCase();
  if (t.includes("CREDIT")) return "CARTAO";
  if (t.includes("INVESTMENT")) return "INVESTIMENTO";
  if (s.includes("SAVINGS") || s.includes("POUPANCA")) return "POUPANCA";
  if (t.includes("BANK")) return "CORRENTE";
  return "OUTRO";
}

// Em conta de credito (cartao) a Pluggy devolve `balance` como o valor DEVIDO,
// em numero positivo. Somar isso ao patrimonio inverteria o sinal da divida
// (fatura de R$ 2.000 apareceria como +2.000), entao guardamos negativo.
export function normalizeBalance(type: string, balance: number): number {
  const isCredit = (type || "").toUpperCase().includes("CREDIT");
  if (!isCredit) return balance;
  return -Math.abs(balance);
}
