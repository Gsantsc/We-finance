// Cria/atualiza os usuarios, as entidades iniciais e as categorias padrao.
// Rode com: npm run seed
import "dotenv/config";
import bcrypt from "bcryptjs";
import {
  upsertUser,
  findEntityByName,
  createEntity,
  upsertCategoryByName,
  type EntityType,
} from "../src/lib/repo";

async function main() {
  const user1Name = process.env.USER1_NAME || "Gabriel";
  const user1Email = process.env.USER1_EMAIL || "gabriel@exemplo.com";
  const user1Password = process.env.USER1_PASSWORD || "mude-esta-senha";

  const user2Name = process.env.USER2_NAME || "Conjuge";
  const user2Email = process.env.USER2_EMAIL || "conjuge@exemplo.com";
  const user2Password = process.env.USER2_PASSWORD || "mude-esta-senha";

  const user1 = await upsertUser({
    name: user1Name,
    email: user1Email,
    passwordHash: await bcrypt.hash(user1Password, 10),
  });
  const user2 = await upsertUser({
    name: user2Name,
    email: user2Email,
    passwordHash: await bcrypt.hash(user2Password, 10),
  });

  const entities: { name: string; type: EntityType; ownerId?: string; color: string }[] = [
    { name: "Casa", type: "CASA", color: "#6366f1" },
    { name: `Pessoal - ${user1Name}`, type: "PESSOAL", ownerId: user1.id, color: "#0ea5e9" },
    { name: `Pessoal - ${user2Name}`, type: "PESSOAL", ownerId: user2.id, color: "#ec4899" },
    { name: `PJ - ${user1Name}`, type: "PJ", ownerId: user1.id, color: "#22c55e" },
  ];
  for (const e of entities) {
    if (!(await findEntityByName(e.name))) await createEntity(e);
  }

  const categories: [string, string, boolean?][] = [
    ["Moradia", "🏠"],
    ["Alimentacao", "🍽️"],
    ["Transporte", "🚗"],
    ["Saude", "🩺"],
    ["Educacao", "📚"],
    ["Lazer", "🎉"],
    ["Compras", "🛍️"],
    ["Assinaturas", "🔁"],
    ["Impostos e taxas", "🧾"],
    ["Servicos PJ", "💼"],
    ["Salario", "💰", true],
    ["Receita PJ", "📈", true],
    ["Investimentos", "📊"],
    ["Transferencia", "🔄"],
    ["Outros", "💸"],
  ];
  for (const [name, icon, isIncome] of categories) {
    await upsertCategoryByName(name, icon, !!isIncome);
  }

  console.log("Seed concluido.");
  console.log(`Usuario 1: ${user1Email}`);
  console.log(`Usuario 2: ${user2Email}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
