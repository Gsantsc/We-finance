import { describe, expect, it } from "vitest";
import { calculatePatrimony, type EntradaPatrimonio } from "@/lib/patrimonio";

const vazio: EntradaPatrimonio = { contas: [], parcelamentos: [], contasFixas: [] };

const conta = (nome: string, saldoCents: number, tipo = "CORRENTE") => ({
  id: nome,
  nome,
  tipo,
  saldoCents,
});

describe("@regression calculatePatrimony", () => {
  it("mes sem nada devolve zero, nao NaN nem undefined", () => {
    const r = calculatePatrimony(vazio);
    expect(r).toMatchObject({ ativosCents: 0, passivosCents: 0, liquidoCents: 0 });
    expect(r.ativos).toEqual([]);
    expect(r.passivos).toEqual([]);
  });

  it("so contas positivas: liquido e' a soma", () => {
    const r = calculatePatrimony({
      ...vazio,
      contas: [conta("Corrente", 760000), conta("Poupança", 240000)],
    });
    expect(r.ativosCents).toBe(1000000);
    expect(r.passivosCents).toBe(0);
    expect(r.liquidoCents).toBe(1000000);
  });

  it("sem investimentos o calculo nao quebra nem inventa a categoria", () => {
    const r = calculatePatrimony({ ...vazio, contas: [conta("Corrente", 500000)] });
    expect(r.ativos).toHaveLength(1);
    expect(r.ativos[0].detalhe).toBe("Conta");
    expect(r.liquidoCents).toBe(500000);
  });

  it("investimento entra como ativo, marcado no detalhamento", () => {
    const r = calculatePatrimony({
      ...vazio,
      contas: [conta("Corrente", 100000), conta("Tesouro", 3880000, "INVESTIMENTO")],
    });
    expect(r.ativosCents).toBe(3980000);
    expect(r.ativos.find((a) => a.rotulo === "Tesouro")?.detalhe).toBe("Investimento");
  });

  it("saldo negativo de cartao vira PASSIVO, nao ativo negativo", () => {
    const r = calculatePatrimony({
      ...vazio,
      contas: [conta("Corrente", 1000000), conta("Cartão", -900000, "CARTAO")],
    });
    // O liquido seria o mesmo somando tudo num balde, mas o tamanho da divida
    // ficaria escondido - e e' isso que o breakdown existe para mostrar.
    expect(r.ativosCents).toBe(1000000);
    expect(r.passivosCents).toBe(900000);
    expect(r.liquidoCents).toBe(100000);
  });

  it("patrimonio NEGATIVO e' um resultado valido, nao um erro", () => {
    const r = calculatePatrimony({
      ...vazio,
      contas: [conta("Corrente", 50000)],
      parcelamentos: [
        { groupId: "g", descricao: "Empréstimo BB", parcelaCents: 71500, parcelasRestantes: 47 },
      ],
    });
    expect(r.liquidoCents).toBe(50000 - 3360500);
    expect(r.liquidoCents).toBeLessThan(0);
  });

  it("emprestimo no meio do prazo: conta as parcelas RESTANTES, nao o valor original", () => {
    // 48x de 715: no meio, 24 pagas e 24 a vencer.
    const r = calculatePatrimony({
      ...vazio,
      parcelamentos: [
        { groupId: "g", descricao: "Empréstimo", parcelaCents: 71500, parcelasRestantes: 24 },
      ],
    });
    expect(r.passivosCents).toBe(71500 * 24); // 1.716.000
    expect(r.passivosCents).not.toBe(71500 * 48); // nao o total original
    expect(r.passivos[0].detalhe).toBe("24 parcelas restantes");
  });

  it("parcelamento quitado sai do passivo", () => {
    const r = calculatePatrimony({
      ...vazio,
      parcelamentos: [
        { groupId: "g", descricao: "Quitado", parcelaCents: 50000, parcelasRestantes: 0 },
      ],
    });
    expect(r.passivosCents).toBe(0);
    expect(r.passivos).toHaveLength(0);
  });

  it("parcelas restantes negativas nao viram credito", () => {
    const r = calculatePatrimony({
      ...vazio,
      parcelamentos: [{ groupId: "g", descricao: "X", parcelaCents: 1000, parcelasRestantes: -3 }],
    });
    expect(r.passivosCents).toBe(0);
  });

  it("contas fixas em aberto entram no passivo", () => {
    const r = calculatePatrimony({
      ...vazio,
      contas: [conta("Corrente", 500000)],
      contasFixas: [
        { id: "1", nome: "Aluguel", valorCents: 220000 },
        { id: "2", nome: "Luz", valorCents: 15000 },
      ],
    });
    expect(r.passivosCents).toBe(235000);
    expect(r.liquidoCents).toBe(265000);
  });

  it("saldo zero nao aparece em lado nenhum", () => {
    const r = calculatePatrimony({ ...vazio, contas: [conta("Zerada", 0)] });
    expect(r.ativos).toHaveLength(0);
    expect(r.passivos).toHaveLength(0);
  });

  it("detalhamento soma exatamente o total - e' o que permite auditar", () => {
    const r = calculatePatrimony({
      contas: [conta("Corrente", 760000), conta("Tesouro", 3880000, "INVESTIMENTO"), conta("Cartão", -157012, "CARTAO")],
      parcelamentos: [{ groupId: "g", descricao: "Empréstimo", parcelaCents: 71500, parcelasRestantes: 47 }],
      contasFixas: [{ id: "1", nome: "Aluguel", valorCents: 220000 }],
    });
    expect(r.ativos.reduce((s, i) => s + i.valorCents, 0)).toBe(r.ativosCents);
    expect(r.passivos.reduce((s, i) => s + i.valorCents, 0)).toBe(r.passivosCents);
    expect(r.ativosCents - r.passivosCents).toBe(r.liquidoCents);
  });

  it("tudo inteiro em centavos: nenhum resultado fracionario", () => {
    // Os valores que quebrariam em float (0.1 + 0.2 !== 0.3) aqui sao 10 e 20.
    const r = calculatePatrimony({
      ...vazio,
      contas: [conta("A", 10), conta("B", 20)],
      contasFixas: [{ id: "1", nome: "C", valorCents: 30 }],
    });
    expect(r.ativosCents).toBe(30);
    expect(r.liquidoCents).toBe(0);
    expect(Number.isInteger(r.ativosCents)).toBe(true);
    expect(Number.isInteger(r.passivosCents)).toBe(true);
    expect(Number.isInteger(r.liquidoCents)).toBe(true);
  });

  it("ordena do maior para o menor nos dois lados", () => {
    const r = calculatePatrimony({
      ...vazio,
      contas: [conta("Pequena", 1000), conta("Grande", 900000), conta("Média", 50000)],
      contasFixas: [
        { id: "1", nome: "Barata", valorCents: 5000 },
        { id: "2", nome: "Cara", valorCents: 220000 },
      ],
    });
    expect(r.ativos.map((a) => a.rotulo)).toEqual(["Grande", "Média", "Pequena"]);
    expect(r.passivos.map((p) => p.rotulo)).toEqual(["Cara", "Barata"]);
  });
});
