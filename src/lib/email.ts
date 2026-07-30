// Envio de email transacional via Resend (RESEND_API_KEY).
//
// EMAIL_FROM precisa ser um remetente verificado no painel do Resend. Sem
// dominio proprio, "onboarding@resend.dev" funciona para testes (so entrega
// para o email do dono da conta Resend).

import { Resend } from "resend";

function getResend(): Resend {
  const key = process.env.RESEND_API_KEY;
  if (!key) throw new Error("RESEND_API_KEY não definida.");
  return new Resend(key);
}

export async function sendVerificationEmail(to: string, name: string, rawToken: string) {
  const base = process.env.NEXTAUTH_URL ?? "http://localhost:3000";
  const link = `${base}/api/auth/confirmar?token=${rawToken}`;
  const from = process.env.EMAIL_FROM ?? "We Finance <onboarding@resend.dev>";

  const { error } = await getResend().emails.send({
    from,
    to,
    subject: "Confirme seu email - We Finance",
    html: `
      <div style="font-family:system-ui,sans-serif;max-width:480px;margin:0 auto;padding:24px">
        <h2 style="color:#0f172a">Bem-vindo(a) ao We Finance, ${name}!</h2>
        <p style="color:#475569;line-height:1.6">
          Sua conta foi criada. Para ativar, confirme seu email clicando no botao abaixo.
        </p>
        <p style="color:#475569;line-height:1.6">
          Sua senha temporaria e <strong>Muda@123</strong> - no primeiro acesso
          voce sera direcionado(a) para criar a sua senha definitiva.
        </p>
        <a href="${link}"
           style="display:inline-block;background:#4f46e5;color:#fff;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:500;margin:16px 0">
          Confirmar email
        </a>
        <p style="color:#94a3b8;font-size:13px">
          O link vale por 24 horas. Se voce nao esperava este email, ignore.
        </p>
      </div>
    `,
  });
  if (error) throw new Error(`Falha ao enviar e-mail de verificação: ${error.message}`);
}

export async function sendPasswordResetEmail(to: string, name: string, rawToken: string) {
  const base = process.env.NEXTAUTH_URL ?? "http://localhost:3000";
  const link = `${base}/redefinir-senha?token=${rawToken}`;
  const from = process.env.EMAIL_FROM ?? "We Finance <onboarding@resend.dev>";

  const { error } = await getResend().emails.send({
    from,
    to,
    subject: "Redefinir sua senha - We Finance",
    html: `
      <div style="font-family:system-ui,sans-serif;max-width:480px;margin:0 auto;padding:24px">
        <h2 style="color:#1C3A31">Redefinir senha</h2>
        <p style="color:#475569;line-height:1.6">
          Olá, ${name}. Recebemos um pedido para redefinir a senha da sua conta no
          We Finance. Clique no botão abaixo para escolher uma nova.
        </p>
        <a href="${link}"
           style="display:inline-block;background:#1C3A31;color:#fff;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:500;margin:16px 0">
          Escolher nova senha
        </a>
        <p style="color:#94a3b8;font-size:13px;line-height:1.6">
          O link vale por 1 hora e só pode ser usado uma vez.<br />
          <strong>Se não foi você que pediu, ignore este e-mail</strong> — sua senha
          continua a mesma e ninguém teve acesso à sua conta.
        </p>
      </div>
    `,
  });
  if (error) throw new Error(`Falha ao enviar e-mail de redefinição: ${error.message}`);
}
