import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next-auth", () => ({ getServerSession: vi.fn() }));
vi.mock("@/lib/repo", () => ({
  listGoals: vi.fn(),
  createGoal: vi.fn(),
  updateGoal: vi.fn(),
  deleteGoal: vi.fn(),
  getUserByEmail: vi.fn(),
}));

import { getServerSession } from "next-auth";
import { listGoals, createGoal, updateGoal, deleteGoal } from "@/lib/repo";
import { GET, POST, DELETE } from "@/app/api/metas/route";

const URL = "http://localhost/api/metas";
const session = { user: { id: "user-1" } };

function postRequest(body: unknown) {
  return new NextRequest(URL, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  vi.mocked(getServerSession).mockReset();
  vi.mocked(listGoals).mockReset();
  vi.mocked(createGoal).mockReset();
  vi.mocked(updateGoal).mockReset();
  vi.mocked(deleteGoal).mockReset();
});

describe("@smoke GET /api/metas", () => {
  it("retorna 401 sem sessao", async () => {
    vi.mocked(getServerSession).mockResolvedValue(null);
    const res = await GET();
    expect(res.status).toBe(401);
    expect(listGoals).not.toHaveBeenCalled();
  });
});

describe("@critical POST /api/metas", () => {
  it("cria quando o corpo nao tem id", async () => {
    vi.mocked(getServerSession).mockResolvedValue(session as any);
    vi.mocked(createGoal).mockReturnValue({ id: "novo" } as any);
    const res = await POST(postRequest({ entityId: "e1", name: "Viagem", targetAmount: 1000 }));
    expect(res.status).toBe(200);
    expect(createGoal).toHaveBeenCalledWith(
      expect.objectContaining({ entityId: "e1", name: "Viagem", targetAmount: 1000 })
    );
    expect(updateGoal).not.toHaveBeenCalled();
  });

  it("aplica deposito (nao cria) quando o corpo tem id", async () => {
    vi.mocked(getServerSession).mockResolvedValue(session as any);
    vi.mocked(updateGoal).mockReturnValue({ id: "g1", currentAmount: 150 } as any);
    const res = await POST(postRequest({ id: "g1", deposito: 50 }));
    expect(res.status).toBe(200);
    expect(updateGoal).toHaveBeenCalledWith("g1", expect.objectContaining({ deposito: 50 }));
    expect(createGoal).not.toHaveBeenCalled();
  });

  it("rejeita targetAmount negativo com 400", async () => {
    vi.mocked(getServerSession).mockResolvedValue(session as any);
    const res = await POST(postRequest({ entityId: "e1", name: "Viagem", targetAmount: -1 }));
    expect(res.status).toBe(400);
    expect(createGoal).not.toHaveBeenCalled();
  });
});

describe("@critical DELETE /api/metas", () => {
  it("retorna 401 sem sessao", async () => {
    vi.mocked(getServerSession).mockResolvedValue(null);
    const res = await DELETE(new NextRequest(`${URL}?id=g1`, { method: "DELETE" }));
    expect(res.status).toBe(401);
    expect(deleteGoal).not.toHaveBeenCalled();
  });

  it("retorna 400 quando falta o id", async () => {
    vi.mocked(getServerSession).mockResolvedValue(session as any);
    const res = await DELETE(new NextRequest(URL, { method: "DELETE" }));
    expect(res.status).toBe(400);
    expect(deleteGoal).not.toHaveBeenCalled();
  });
});
