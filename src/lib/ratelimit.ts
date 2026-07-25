// Rate limiting em memoria, por chave (ex: "login:email@x.com").
//
// Limitacao conhecida: na Vercel cada instancia serverless tem a propria
// memoria, entao o limite vale por instancia, nao globalmente - um atacante
// distribuido consegue mais tentativas que o teto. Ainda assim corta o
// grosso do brute force (que reaproveita conexoes quentes) sem depender de
// servico externo. Se o app crescer, trocar por um limitador com Redis
// (ex: Upstash Ratelimit) mantendo esta mesma interface.

type Bucket = { count: number; resetAt: number };

const buckets = new Map<string, Bucket>();

// true = pode seguir; false = estourou o limite na janela.
export function rateLimit(key: string, max: number, windowMs: number): boolean {
  if (process.env.NODE_ENV === "test") return true;

  const now = Date.now();

  // Faxina ocasional para o Map nao crescer sem limite em instancia longa.
  if (buckets.size > 10_000) {
    for (const [k, b] of buckets) {
      if (b.resetAt < now) buckets.delete(k);
    }
  }

  const bucket = buckets.get(key);
  if (!bucket || bucket.resetAt < now) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return true;
  }
  if (bucket.count >= max) return false;
  bucket.count += 1;
  return true;
}
