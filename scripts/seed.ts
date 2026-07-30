// Cria/atualiza os usuarios, as entidades iniciais e as categorias padrao.
// Rode com: npm run seed
import "dotenv/config";
import bcrypt from "bcryptjs";
import {
  upsertUser,
  findEntityByName,
  createEntity,
  upsertCategoryByName,
  getHouseholdIdForUser,
  createHousehold,
  addHouseholdMember,
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

  // Household compartilhado dos dois usuarios do seed.
  const existente = await getHouseholdIdForUser(user1.id);
  const householdId: string =
    existente ?? (await createHousehold(`Casa de ${user1Name} e ${user2Name}`)).id;
  await addHouseholdMember(householdId, user1.id);
  await addHouseholdMember(householdId, user2.id);

  const entities: { name: string; type: EntityType; ownerId?: string; color: string }[] = [
    { name: "Casa", type: "CASA", color: "#6366f1" },
    { name: `Pessoal - ${user1Name}`, type: "PESSOAL", ownerId: user1.id, color: "#0ea5e9" },
    { name: `Pessoal - ${user2Name}`, type: "PESSOAL", ownerId: user2.id, color: "#ec4899" },
    { name: `PJ - ${user1Name}`, type: "PJ", ownerId: user1.id, color: "#22c55e" },
  ];
  for (const e of entities) {
    if (!(await findEntityByName(householdId, e.name))) await createEntity(householdId, e);
  }

  // Grafia acentuada, igual a que a migracao 0007 deixou no banco.
  // upsertCategoryByName casa sem acento, entao rodar isto numa base antiga nao
  // duplica nada - so reconhece o que ja existe.
  const categories: [string, string, boolean?][] = [
    ["Moradia", "🏠"],
    ["Alimentação", "🍽️"],
    ["Mercado", "🛒"],
    ["Transporte", "🚗"],
    ["Contas", "🧾"],
    ["Saúde", "🩺"],
    ["Educação", "📚"],
    ["Lazer", "🎉"],
    ["Compras", "🛍️"],
    ["Vestuário", "👕"],
    ["Assinaturas", "🔁"],
    ["Impostos e taxas", "🧾"],
    ["Serviços PJ", "💼"],
    ["Salário", "💰", true],
    ["Receita PJ", "📈", true],
    ["Freelance", "💼", true],
    ["Rendimentos", "📈", true],
    ["Reembolso", "↩️", true],
    ["Investimentos", "📊"],
    ["Transferência", "🔄"],
    ["Outros", "💸"],
  ];
  for (const [name, icon, isIncome] of categories) {
    await upsertCategoryByName(name, icon, !!isIncome);
  }

  console.log("Seed concluido.");
  console.log(`Usuario 1: ${user1Email}`);
  console.log(`Usuario 2: ${user2Email}`);
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
