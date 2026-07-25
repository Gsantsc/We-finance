import { describe, expect, it } from "vitest";
import { detectDelimiter, parseCSV, parseAmount, parseDateBR } from "@/lib/csv";

describe("@regression detectDelimiter", () => {
  it("detecta ponto-e-virgula (padrao BR)", () => {
    expect(detectDelimiter("data;descricao;valor")).toBe(";");
  });
  it("detecta virgula", () => {
    expect(detectDelimiter("date,description,amount")).toBe(",");
  });
  it("ignora separador dentro de aspas (cabecalho com virgula entre aspas)", () => {
    expect(detectDelimiter('"Conta, principal";descricao;valor')).toBe(";");
  });
});

describe("@regression parseCSV", () => {
  it("separa linhas e colunas", () => {
    const r = parseCSV("a,b,c\n1,2,3");
    expect(r).toEqual([
      ["a", "b", "c"],
      ["1", "2", "3"],
    ]);
  });
  it("respeita aspas com separador e virgula decimal dentro", () => {
    const r = parseCSV('data;desc;valor\n01/02/2026;"Mercado; Bh";"1.234,56"', ";");
    expect(r[1]).toEqual(["01/02/2026", "Mercado; Bh", "1.234,56"]);
  });
  it("escapa aspas duplas", () => {
    const r = parseCSV('x\n"ele disse ""oi"""');
    expect(r[1]).toEqual(['ele disse "oi"']);
  });
  it("remove BOM do Excel e linhas vazias", () => {
    const r = parseCSV("﻿a,b\n1,2\n\n3,4\n");
    expect(r).toEqual([
      ["a", "b"],
      ["1", "2"],
      ["3", "4"],
    ]);
  });
});

describe("@regression parseAmount", () => {
  it("formato BR com milhar e decimal", () => {
    expect(parseAmount("R$ 1.234,56")).toBeCloseTo(1234.56);
  });
  it("formato US com milhar e decimal", () => {
    expect(parseAmount("1,234.56")).toBeCloseTo(1234.56);
  });
  it("virgula decimal simples", () => {
    expect(parseAmount("45,90")).toBeCloseTo(45.9);
  });
  it("negativo com sinal e com parenteses", () => {
    expect(parseAmount("-45,90")).toBeCloseTo(-45.9);
    expect(parseAmount("(45,90)")).toBeCloseTo(-45.9);
  });
  it("texto invalido vira null", () => {
    expect(parseAmount("")).toBeNull();
    expect(parseAmount("abc")).toBeNull();
  });
});

describe("@regression parseDateBR", () => {
  it("DD/MM/YYYY", () => {
    expect(parseDateBR("07/02/2026")).toBe("2026-02-07");
  });
  it("ISO ja pronto", () => {
    expect(parseDateBR("2026-02-07")).toBe("2026-02-07");
    expect(parseDateBR("2026-02-07T10:00:00Z")).toBe("2026-02-07");
  });
  it("DD-MM-YY expande o ano", () => {
    expect(parseDateBR("07-02-26")).toBe("2026-02-07");
  });
  it("mes invalido vira null", () => {
    expect(parseDateBR("07/13/2026")).toBeNull();
    expect(parseDateBR("sem data")).toBeNull();
  });
});
