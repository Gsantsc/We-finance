import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/repo", () => ({
  createPendingUser: vi.fn(),
  createHousehold: vi.fn(),
  addHouseholdMember: vi.fn(),
  createEmailVerificationToken: vi.fn(),
  getUserByEmail: vi.fn(),
}));
vi.mock("@/lib/email", () => ({ sendVerificationEmail: vi.fn() }));

import {
  createPendingUser,
  createHousehold,
  addHouseholdMember,
  createEmailVerificationToken,
  getUserByEmail,
} from "@/lib/repo";
import { sendVerificationEmail } from "@/lib/email";
import { POST } from "@/app/api/auth/registrar/route";

const URL = "http://localhost/api/auth/registrar";

function postRequest(body: unknown) {
  return new NextRequest(URL, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  vi.mocked(createPendingUser).mockReset().mockImplementation(async (u: any) => ({ id: `id-${u.email}`, ...u }));
  vi.mocked(createHousehold).mockReset().mockResolvedValue({ id: "house-1", inviteCode: "abc123" } as any);
  vi.mocked(addHouseholdMember).mockReset();
  vi.mocked(createEmailVerificationToken).mockReset().mockResolvedValue("token-cru");
  vi.mocked(getUserByEmail).mockReset().mockResolvedValue(undefined);
  vi.mocked(sendVerificationEmail).mockReset().mockResolvedValue(undefined);
  delete process.env.ALLOWED_SIGNUP_EMAILS;
});

afterEach(() => {
  delete process.env.ALLOWED_SIGNUP_EMAILS;
});

describe("@critical POST /api/auth/registrar (conta UNICA)", () => {
  it("cria 1 usuario, 1 household e envia 1 email", async () => {
    const res = await POST(postRequest({ tipo: "UNICA", name: "Ana", email: "ana@ex.com" }));
    expect(res.status).toBe(200);
    expect(createPendingUser).toHaveBeenCalledTimes(1);
    expect(createHousehold).toHaveBeenCalledTimes(1);
    expect(addHouseholdMember).toHaveBeenCalledTimes(1);
    expect(sendVerificationEmail).toHaveBeenCalledTimes(1);
  });

  it("rejeita email ja cadastrado com 409", async () => {
    vi.mocked(getUserByEmail).mockResolvedValue({ id: "u1" } as any);
    const res = await POST(postRequest({ tipo: "UNICA", name: "Ana", email: "ana@ex.com" }));
    expect(res.status).toBe(409);
    expect(createPendingUser).not.toHaveBeenCalled();
  });
});

describe("@critical POST /api/auth/registrar (conta CASAL)", () => {
  const corpo = {
    tipo: "CASAL",
    name: "Ana",
    email: "ana@ex.com",
    partnerName: "Bia",
    partnerEmail: "bia@ex.com",
  };

  it("cria 2 usuarios no mesmo household e envia 2 emails", async () => {
    const res = await POST(postRequest(corpo));
    expect(res.status).toBe(200);
    expect(createPendingUser).toHaveBeenCalledTimes(2);
    expect(createHousehold).toHaveBeenCalledTimes(1);
    expect(addHouseholdMember).toHaveBeenCalledTimes(2);
    expect(addHouseholdMember).toHaveBeenNthCalledWith(1, "house-1", "id-ana@ex.com");
    expect(addHouseholdMember).toHaveBeenNthCalledWith(2, "house-1", "id-bia@ex.com");
    expect(sendVerificationEmail).toHaveBeenCalledTimes(2);
  });

  it("rejeita parceiro sem nome/email com 400", async () => {
    const res = await POST(postRequest({ tipo: "CASAL", name: "Ana", email: "ana@ex.com" }));
    expect(res.status).toBe(400);
    expect(createPendingUser).not.toHaveBeenCalled();
  });

  it("rejeita parceiro com o mesmo email do titular com 400", async () => {
    const res = await POST(
      postRequest({ ...corpo, partnerEmail: "ana@ex.com" })
    );
    expect(res.status).toBe(400);
    expect(createPendingUser).not.toHaveBeenCalled();
  });
});

describe("@critical allowlist de cadastro", () => {
  it("bloqueia email fora da allowlist com 403", async () => {
    process.env.ALLOWED_SIGNUP_EMAILS = "permitido@ex.com";
    const res = await POST(postRequest({ tipo: "UNICA", name: "Ana", email: "ana@ex.com" }));
    expect(res.status).toBe(403);
    expect(createPendingUser).not.toHaveBeenCalled();
  });

  it("permite email da allowlist", async () => {
    process.env.ALLOWED_SIGNUP_EMAILS = "ana@ex.com, outro@ex.com";
    const res = await POST(postRequest({ tipo: "UNICA", name: "Ana", email: "ana@ex.com" }));
    expect(res.status).toBe(200);
  });

  it("bloqueia parceiro fora da allowlist com 403", async () => {
    process.env.ALLOWED_SIGNUP_EMAILS = "ana@ex.com";
    const res = await POST(
      postRequest({
        tipo: "CASAL",
        name: "Ana",
        email: "ana@ex.com",
        partnerName: "Bia",
        partnerEmail: "bia@ex.com",
      })
    );
    expect(res.status).toBe(403);
    expect(createPendingUser).not.toHaveBeenCalled();
  });
});
