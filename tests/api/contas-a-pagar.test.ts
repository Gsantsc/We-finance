import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next-auth", () => ({ getServerSession: vi.fn() }));
vi.mock("@/lib/repo", () => ({
  listBills: vi.fn(),
  createBill: vi.fn(),
  updateBill: vi.fn(),
  deleteBill: vi.fn(),
  getUserByEmail: vi.fn(),
}));

import { getServerSession } from "next-auth";
import { listBills, createBill, updateBill, deleteBill } from "@/lib/repo";
import { GET, POST, DELETE } from "@/app/api/contas-a-pagar/route";

const URL = "http://localhost/api/contas-a-pagar";
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
  vi.mocked(listBills).mockReset();
  vi.mocked(createBill).mockReset();
  vi.mocked(updateBill).mockReset();
  vi.mocked(deleteBill).mockReset();
});

describe("@smoke GET /api/contas-a-pagar", () => {
  it("retorna 401 sem sessao", async () => {
    vi.mocked(getServerSession).mockResolvedValue(null);
    const res = await GET();
    expect(res.status).toBe(401);
    expect(listBills).not.toHaveBeenCalled();
  });

  it("retorna a lista com sessao valida", async () => {
    vi.mocked(getServerSession).mockResolvedValue(session as any);
    vi.mocked(listBills).mockReturnValue([{ id: "b1" }] as any);
    const res = await GET();
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual([{ id: "b1" }]);
  });
});

describe("@critical POST /api/contas-a-pagar", () => {
  it("retorna 401 sem sessao", async () => {
    vi.mocked(getServerSession).mockResolvedValue(null);
    const res = await POST(postRequest({ entityId: "e1", name: "Aluguel", amount: 100, dueDay: 5 }));
    expect(res.status).toBe(401);
    expect(createBill).not.toHaveBeenCalled();
  });

  it("cria quando o corpo nao tem id", async () => {
    vi.mocked(getServerSession).mockResolvedValue(session as any);
    vi.mocked(createBill).mockReturnValue({ id: "novo" } as any);
    const res = await POST(postRequest({ entityId: "e1", name: "Aluguel", amount: 100, dueDay: 5 }));
    expect(res.status).toBe(200);
    expect(createBill).toHaveBeenCalledWith(
      expect.objectContaining({ entityId: "e1", name: "Aluguel", amount: 100, dueDay: 5 })
    );
    expect(updateBill).not.toHaveBeenCalled();
  });

  it("atualiza (e nao cria) quando o corpo tem id", async () => {
    vi.mocked(getServerSession).mockResolvedValue(session as any);
    vi.mocked(updateBill).mockReturnValue({ id: "b1", pagoEsteMes: true } as any);
    const res = await POST(postRequest({ id: "b1", pagar: true }));
    expect(res.status).toBe(200);
    expect(updateBill).toHaveBeenCalledWith("b1", expect.objectContaining({ pagar: true }));
    expect(createBill).not.toHaveBeenCalled();
  });

  it("rejeita corpo invalido (dueDay fora do range) com 400", async () => {
    vi.mocked(getServerSession).mockResolvedValue(session as any);
    const res = await POST(postRequest({ entityId: "e1", name: "Aluguel", amount: 100, dueDay: 40 }));
    expect(res.status).toBe(400);
    expect(createBill).not.toHaveBeenCalled();
  });
});

describe("@critical DELETE /api/contas-a-pagar", () => {
  it("retorna 401 sem sessao", async () => {
    vi.mocked(getServerSession).mockResolvedValue(null);
    const res = await DELETE(new NextRequest(`${URL}?id=b1`, { method: "DELETE" }));
    expect(res.status).toBe(401);
    expect(deleteBill).not.toHaveBeenCalled();
  });

  it("retorna 400 quando falta o id", async () => {
    vi.mocked(getServerSession).mockResolvedValue(session as any);
    const res = await DELETE(new NextRequest(URL, { method: "DELETE" }));
    expect(res.status).toBe(400);
    expect(deleteBill).not.toHaveBeenCalled();
  });

  it("remove quando o id vem na query", async () => {
    vi.mocked(getServerSession).mockResolvedValue(session as any);
    const res = await DELETE(new NextRequest(`${URL}?id=b1`, { method: "DELETE" }));
    expect(res.status).toBe(200);
    expect(deleteBill).toHaveBeenCalledWith("b1");
  });
});
