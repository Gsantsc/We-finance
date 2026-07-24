// Gera os icones PNG do app (PWA) sem depender de nenhuma biblioteca:
// desenha os pixels na mao e escreve o PNG com o zlib do proprio Node.
//
// Rode com: npm run icones
//
// Saida em public/: icone-192.png, icone-512.png, icone-maskable-512.png
// e apple-touch-icon.png (o do iPhone).

import { deflateSync } from "node:zlib";
import { writeFileSync, mkdirSync } from "node:fs";
import path from "node:path";

// ---------- escrita de PNG ----------

const crcTable = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = crcTable[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const corpo = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(corpo), 0);
  return Buffer.concat([len, corpo, crc]);
}

function png(width, height, rgba) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // 8 bits por canal
  ihdr[9] = 6; // RGBA
  // 10,11,12 = compressao/filtro/entrelacamento padrao (0)

  // Cada linha do PNG comeca com um byte de filtro; usamos 0 (sem filtro).
  const bruto = Buffer.alloc(height * (1 + width * 4));
  for (let y = 0; y < height; y++) {
    const destino = y * (1 + width * 4);
    bruto[destino] = 0;
    rgba.copy
      ? rgba.copy(bruto, destino + 1, y * width * 4, (y + 1) * width * 4)
      : Buffer.from(rgba.buffer).copy(bruto, destino + 1, y * width * 4, (y + 1) * width * 4);
  }

  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(bruto, { level: 9 })),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

// ---------- desenho ----------

// Distancia ate um retangulo de cantos arredondados (negativo = dentro).
// E o que da o canto suave sem precisar de biblioteca grafica.
function distRetanguloArredondado(px, py, cx, cy, hw, hh, r) {
  const qx = Math.abs(px - cx) - (hw - r);
  const qy = Math.abs(py - cy) - (hh - r);
  const ax = Math.max(qx, 0);
  const ay = Math.max(qy, 0);
  return Math.hypot(ax, ay) + Math.min(Math.max(qx, qy), 0) - r;
}

// As 3 barras do "grafico", em coordenadas de 0 a 1.
const BARRAS = [
  { x: 0.26, largura: 0.12, altura: 0.20 },
  { x: 0.44, largura: 0.12, altura: 0.32 },
  { x: 0.62, largura: 0.12, altura: 0.44 },
];
const BASE = 0.74; // linha de base das barras

function desenhar(tamanho, { cantoArredondado, escalaConteudo }) {
  const SS = 4; // desenha 4x maior e reduz depois = bordas suaves
  const L = tamanho * SS;
  const px = Buffer.alloc(L * L * 4);

  const raioFundo = cantoArredondado ? 0.22 * L : 0;

  for (let y = 0; y < L; y++) {
    for (let x = 0; x < L; x++) {
      // amostra no centro do pixel
      const fx = (x + 0.5) / L;
      const fy = (y + 0.5) / L;

      const dentroFundo =
        distRetanguloArredondado(x + 0.5, y + 0.5, L / 2, L / 2, L / 2, L / 2, raioFundo) < 0;

      let r = 0, g = 0, b = 0, a = 0;

      if (dentroFundo) {
        // degrade vertical de indigo claro para indigo escuro
        const t = fy;
        r = Math.round(0x63 + (0x43 - 0x63) * t);
        g = Math.round(0x66 + (0x38 - 0x66) * t);
        b = Math.round(0xf1 + (0xca - 0xf1) * t);
        a = 255;

        // conteudo (as barras), encolhido em volta do centro quando maskable
        const cx = 0.5 + (fx - 0.5) / escalaConteudo;
        const cy = 0.5 + (fy - 0.5) / escalaConteudo;

        for (const barra of BARRAS) {
          const meiaL = barra.largura / 2;
          const meiaA = barra.altura / 2;
          const centroX = barra.x + meiaL;
          const centroY = BASE - meiaA;
          const d = distRetanguloArredondado(cx, cy, centroX, centroY, meiaL, meiaA, 0.028);
          if (d < 0) {
            r = 255; g = 255; b = 255;
          }
        }
      }

      const i = (y * L + x) * 4;
      px[i] = r; px[i + 1] = g; px[i + 2] = b; px[i + 3] = a;
    }
  }

  // reduz SSxSS -> 1 pixel, fazendo a media (antialiasing)
  const saida = Buffer.alloc(tamanho * tamanho * 4);
  for (let y = 0; y < tamanho; y++) {
    for (let x = 0; x < tamanho; x++) {
      let r = 0, g = 0, b = 0, a = 0;
      for (let sy = 0; sy < SS; sy++) {
        for (let sx = 0; sx < SS; sx++) {
          const i = ((y * SS + sy) * L + (x * SS + sx)) * 4;
          r += px[i]; g += px[i + 1]; b += px[i + 2]; a += px[i + 3];
        }
      }
      const n = SS * SS;
      const i = (y * tamanho + x) * 4;
      saida[i] = Math.round(r / n);
      saida[i + 1] = Math.round(g / n);
      saida[i + 2] = Math.round(b / n);
      saida[i + 3] = Math.round(a / n);
    }
  }

  return png(tamanho, tamanho, saida);
}

// ---------- geracao ----------

const destino = path.join(process.cwd(), "public");
mkdirSync(destino, { recursive: true });

const arquivos = [
  // icones normais: quadrado com canto arredondado, conteudo cheio
  ["icone-192.png", 192, { cantoArredondado: true, escalaConteudo: 1 }],
  ["icone-512.png", 512, { cantoArredondado: true, escalaConteudo: 1 }],
  // maskable: o Android recorta as bordas, entao o conteudo fica menor e o
  // fundo ocupa o quadrado inteiro
  ["icone-maskable-512.png", 512, { cantoArredondado: false, escalaConteudo: 0.62 }],
  // iPhone: o proprio iOS arredonda, entao mandamos quadrado cheio
  ["apple-touch-icon.png", 180, { cantoArredondado: false, escalaConteudo: 0.82 }],
];

for (const [nome, tamanho, opcoes] of arquivos) {
  const buf = desenhar(tamanho, opcoes);
  writeFileSync(path.join(destino, nome), buf);
  console.log(`public/${nome}  ${tamanho}x${tamanho}  ${(buf.length / 1024).toFixed(1)} KB`);
}

console.log("Icones gerados.");
