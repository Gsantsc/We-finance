import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/repo", () => ({ consumeEmailVerificationToken: vi.fn() }));

import { consumeEmailVerificationToken } from "@/lib/repo";
import { GET } from "@/app/api/auth/confirmar/route";

const ROTA = "http://localhost/api/auth/confirmar";

function local(res: Response): string {
  return new URL(res.headers.get("location")!).search;
}

beforeEach(() => {
  vi.mocked(consumeEmailVerificationToken).mockReset();
  process.env.NEXTAUTH_URL = "http://localhost";
});

describe("@critical GET /api/auth/confirmar", () => {
  it("sem token redireciona com confirmacao=invalida", async () => {
    const res = await GET(new NextRequest(ROTA));
    expect(res.status).toBeGreaterThanOrEqual(300);
    expect(local(res)).toBe("?confirmacao=invalida");
    expect(consumeEmailVerificationToken).not.toHaveBeenCalled();
  });

  it("token invalido/expirado redireciona com confirmacao=expirada", async () => {
    vi.mocked(consumeEmailVerificationToken).mockResolvedValue(null);
    const res = await GET(new NextRequest(`${ROTA}?token=abc`));
    expect(local(res)).toBe("?confirmacao=expirada");
  });

  it("conta unica confirmada redireciona com confirmacao=ok", async () => {
    vi.mocked(consumeEmailVerificationToken).mockResolvedValue([{ id: "u1" }] as any);
    const res = await GET(new NextRequest(`${ROTA}?token=abc`));
    expect(local(res)).toBe("?confirmacao=ok");
  });

  it("conta casal: um clique confirma os dois e redireciona com ok-casal", async () => {
    vi.mocked(consumeEmailVerificationToken).mockResolvedValue([
      { id: "u1" },
      { id: "u2" },
    ] as any);
    const res = await GET(new NextRequest(`${ROTA}?token=abc`));
    expect(local(res)).toBe("?confirmacao=ok-casal");
  });
});
