import { describe, expect, it } from "vitest";
import { config } from "@/middleware";

describe("@smoke middleware matcher", () => {
  it("protege as rotas de API novas (orcamentos, metas, contas-a-pagar, relatorios)", () => {
    expect(config.matcher).toEqual(
      expect.arrayContaining([
        "/api/orcamentos/:path*",
        "/api/metas/:path*",
        "/api/contas-a-pagar/:path*",
        "/api/relatorios/:path*",
      ])
    );
  });

  it("protege as telas novas (orcamentos, metas, contas-a-pagar)", () => {
    expect(config.matcher).toEqual(
      expect.arrayContaining(["/orcamentos/:path*", "/metas/:path*", "/contas-a-pagar/:path*"])
    );
  });
});
