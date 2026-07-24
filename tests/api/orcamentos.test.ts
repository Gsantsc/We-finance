import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next-auth", () => ({ getServerSession: vi.fn() }));
vi.mock("@/lib/repo", () => ({
  listBudgets: vi.fn(),
  upsertBudget: vi.fn(),
  deleteBudget: vi.fn(),
  getUserByEmail: vi.fn(),
}));

import { getServerSession } from "next-auth";
import { listBudgets, upsertBudget, deleteBudget } from "@/lib/repo";
import { GET, POST, DELETE } from "@/app/api/orcamentos/route";

const URL = "http://localhost/api/orcamentos";
const session = { user: { id: "user-1" } };

beforeEach(() => {
  vi.mocked(getServerSession).mockReset();
  vi.mocked(listBudgets).mockReset();
  vi.mocked(upsertBudget).mockReset();
  vi.mocked(deleteBudget).mockReset();
});

describe("@smoke GET /api/orcamentos", () => {
  it("retorna 401 sem sessao", async () => {
    vi.mocked(getServerSession).mockResolvedValue(null);
    const res = await GET(new NextRequest(`${URL}?month=6&year=2026`));
    expect(res.status).toBe(401);
    expect(listBudgets).not.toHaveBeenCalled();
  });

  it("repassa month/year da query", async () => {
    vi.mocked(getServerSession).mockResolvedValue(session as any);
    vi.mocked(listBudgets).mockReturnValue([] as any);
    await GET(new NextRequest(`${URL}?month=3&year=2027`));
    expect(listBudgets).toHaveBeenCalledWith(3, 2027);
  });
});

describe("@critical POST /api/orcamentos", () => {
  it("retorna 401 sem sessao", async () => {
    vi.mocked(getServerSession).mockResolvedValue(null);
    const res = await POST(
      new NextRequest(URL, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ entityId: "e1", categoryId: "c1", month: 6, year: 2026, amount: 500 }),
      })
    );
    expect(res.status).toBe(401);
    expect(upsertBudget).not.toHaveBeenCalled();
  });

  it("rejeita mes fora do range com 400", async () => {
    vi.mocked(getServerSession).mockResolvedValue(session as any);
    const res = await POST(
      new NextRequest(URL, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ entityId: "e1", categoryId: "c1", month: 13, year: 2026, amount: 500 }),
      })
    );
    expect(res.status).toBe(400);
    expect(upsertBudget).not.toHaveBeenCalled();
  });
});

describe("@critical DELETE /api/orcamentos", () => {
  it("retorna 401 sem sessao", async () => {
    vi.mocked(getServerSession).mockResolvedValue(null);
    const res = await DELETE(new NextRequest(`${URL}?id=b1`, { method: "DELETE" }));
    expect(res.status).toBe(401);
    expect(deleteBudget).not.toHaveBeenCalled();
  });

  it("retorna 400 quando falta o id", async () => {
    vi.mocked(getServerSession).mockResolvedValue(session as any);
    const res = await DELETE(new NextRequest(URL, { method: "DELETE" }));
    expect(res.status).toBe(400);
    expect(deleteBudget).not.toHaveBeenCalled();
  });
});
