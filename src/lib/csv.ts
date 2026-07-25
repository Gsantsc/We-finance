// Parser de CSV e helpers de numero/data - funcoes puras, sem I/O, usadas
// tanto no cliente (tela /importar, para preview) quanto no servidor (revalida
// antes de gravar). Nada de dependencia externa: extrato de banco brasileiro
// costuma vir com ";" e virgula decimal, entao tratamos os dois formatos.

// Detecta o separador olhando a primeira linha: o que aparecer mais vezes
// fora de aspas vence (";" e' comum no Brasil porque a virgula e' decimal).
export function detectDelimiter(sample: string): "," | ";" | "\t" {
  const firstLine = sample.split(/\r?\n/, 1)[0] ?? "";
  const counts: Record<string, number> = { ",": 0, ";": 0, "\t": 0 };
  let inQuotes = false;
  for (const ch of firstLine) {
    if (ch === '"') inQuotes = !inQuotes;
    else if (!inQuotes && ch in counts) counts[ch] += 1;
  }
  const best = (Object.entries(counts).sort((a, b) => b[1] - a[1])[0]?.[0] ?? ",") as "," | ";" | "\t";
  return counts[best] > 0 ? best : ",";
}

// Parser de CSV que respeita aspas (campo pode conter o separador ou quebra de
// linha dentro de aspas duplas, com "" escapando aspas). Retorna matriz de
// celulas ja sem as aspas.
export function parseCSV(text: string, delimiter?: string): string[][] {
  const delim = delimiter ?? detectDelimiter(text);
  // BOM do Excel atrapalha o header - remove.
  const src = text.replace(/^﻿/, "");
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;

  for (let i = 0; i < src.length; i++) {
    const ch = src[i];
    if (inQuotes) {
      if (ch === '"') {
        if (src[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += ch;
      }
      continue;
    }
    if (ch === '"') {
      inQuotes = true;
    } else if (ch === delim) {
      row.push(field);
      field = "";
    } else if (ch === "\n") {
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else if (ch === "\r") {
      // ignora; o \n seguinte fecha a linha
    } else {
      field += ch;
    }
  }
  // Ultima celula/linha (arquivo sem \n no fim).
  if (field.length > 0 || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  // Remove linhas totalmente vazias.
  return rows.filter((r) => r.some((c) => c.trim() !== ""));
}

// Numero em reais a partir de texto de planilha. Aceita "R$ 1.234,56",
// "1234.56", "-45,90", "(45,90)" (parenteses = negativo, comum em extrato).
// Retorna null se nao for numero.
export function parseAmount(raw: string): number | null {
  if (raw == null) return null;
  let s = String(raw).trim();
  if (!s) return null;

  let negativo = false;
  if (/^\(.*\)$/.test(s)) {
    negativo = true;
    s = s.slice(1, -1);
  }
  // tira tudo que nao e' digito, sinal, ponto ou virgula
  s = s.replace(/[^\d,.\-]/g, "");
  if (s.includes("-")) negativo = true;
  s = s.replace(/-/g, "");
  if (!s) return null;

  const temVirgula = s.includes(",");
  const temPonto = s.includes(".");
  if (temVirgula && temPonto) {
    // o ultimo separador e' o decimal; o outro e' milhar
    if (s.lastIndexOf(",") > s.lastIndexOf(".")) {
      s = s.replace(/\./g, "").replace(",", "."); // formato BR: 1.234,56
    } else {
      s = s.replace(/,/g, ""); // formato US: 1,234.56
    }
  } else if (temVirgula) {
    s = s.replace(",", "."); // 45,90 -> 45.90
  }

  const n = Number(s);
  if (!Number.isFinite(n)) return null;
  return negativo ? -Math.abs(n) : n;
}

// Data de planilha -> "YYYY-MM-DD". Aceita DD/MM/YYYY, DD-MM-YYYY, YYYY-MM-DD e
// DD/MM/YY. Retorna null se nao reconhecer.
export function parseDateBR(raw: string): string | null {
  if (!raw) return null;
  const s = String(raw).trim();

  // ISO ja pronto (YYYY-MM-DD, opcionalmente com hora)
  const iso = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;

  const m = s.match(/^(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{2,4})/);
  if (m) {
    let [, d, mo, y] = m;
    if (y.length === 2) y = Number(y) > 70 ? `19${y}` : `20${y}`;
    const dd = d.padStart(2, "0");
    const mm = mo.padStart(2, "0");
    if (Number(mm) < 1 || Number(mm) > 12 || Number(dd) < 1 || Number(dd) > 31) return null;
    return `${y}-${mm}-${dd}`;
  }
  return null;
}
