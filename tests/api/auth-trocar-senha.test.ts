import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next-auth", () => ({ getServerSession: vi.fn() }));
vi.mock("@/lib/repo", () => ({
  setUserPassword: vi.fn(),
  getUserByEmail: vi.fn(),
  getHouseholdIdForUser: vi.fn(),
}));

import { getServerSession } from "next-auth";
import { setUserPassword } from "@/lib/repo";
import { POST } from "@/app/api/auth/trocar-senha/route";

const URL = "http://localhost/api/auth/trocar-senha";
const session = { user: { id: "user-1", householdId: "house-1", mustChangePassword: true } };

function postRequest(body: unknown) {
  return new NextRequest(URL, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  vi.mocked(getServerSession).mockReset();
  vi.mocked(setUserPassword).mockReset();
});

describe("@critical POST /api/auth/trocar-senha", () => {
  it("retorna 401 sem sessao", async () => {
    vi.mocked(getServerSession).mockResolvedValue(null);
    const res = await POST(postRequest({ newPassword: "NovaSenha1" }));
    expect(res.status).toBe(401);
    expect(setUserPassword).not.toHaveBeenCalled();
  });

  it("funciona mesmo com mustChangePassword ativo (e o proposito da rota)", async () => {
    vi.mocked(getServerSession).mockResolvedValue(session as any);
    const res = await POST(postRequest({ newPassword: "NovaSenha1" }));
    expect(res.status).toBe(200);
    expect(setUserPassword).toHaveBeenCalledWith("user-1", expect.any(String));
  });

  it("rejeita a propria senha padrao com 400", async () => {
    vi.mocked(getServerSession).mockResolvedValue(session as any);
    const res = await POST(postRequest({ newPassword: "Muda@123" }));
    expect(res.status).toBe(400);
    expect(setUserPassword).not.toHaveBeenCalled();
  });

  it("rejeita senha fraca (sem maiuscula/numero) com 400", async () => {
    vi.mocked(getServerSession).mockResolvedValue(session as any);
    for (const fraca of ["soletras", "SOLETRAS1", "semnumeroA", "curta1A"]) {
      const res = await POST(postRequest({ newPassword: fraca }));
      expect(res.status).toBe(400);
    }
    expect(setUserPassword).not.toHaveBeenCalled();
  });

  it("guarda hash bcrypt, nunca a senha em texto puro", async () => {
    vi.mocked(getServerSession).mockResolvedValue(session as any);
    await POST(postRequest({ newPassword: "NovaSenha1" }));
    const hash = vi.mocked(setUserPassword).mock.calls[0][1];
    expect(hash).not.toBe("NovaSenha1");
    expect(hash).toMatch(/^\$2[aby]\$/);
  });
});
