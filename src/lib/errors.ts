// Erro com status HTTP. Vive num modulo proprio para o repo.ts poder lancar
// 404/403 sem importar api.ts (que importa auth.ts, que importa repo.ts).
export class ApiError extends Error {
  status: number;
  constructor(message: string, status = 400) {
    super(message);
    this.status = status;
  }
}
