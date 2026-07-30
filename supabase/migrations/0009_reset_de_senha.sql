-- Recuperacao de senha ("esqueci minha senha").
--
-- Tabela SEPARADA de email_verification_tokens de proposito. Reaproveitar
-- aquela seria mais curto e abriria um buraco: um link de confirmacao de
-- cadastro (que chega por email e vive 24h) passaria a valer como autorizacao
-- para TROCAR A SENHA de quem o recebeu. Proposito diferente, tabela diferente,
-- TTL diferente.
--
-- Guarda so o HASH do token, igual ao fluxo de verificacao: quem ler o banco
-- nao consegue reidratar o link e entrar na conta de ninguem.

create table if not exists public.password_reset_tokens (
  id         text primary key default gen_random_uuid()::text,
  user_id    text not null references public.users(id) on delete cascade,
  token_hash text not null unique,
  expires_at text not null,          -- ISO, mesmo formato do resto da tabela users
  used_at    text,                   -- preenchido no consumo; linha fica para auditoria
  created_at text not null,
  requested_ip text
);

create index if not exists idx_password_reset_user
  on public.password_reset_tokens(user_id);

-- Varre pendentes por validade sem escanear a tabela toda.
create index if not exists idx_password_reset_expira
  on public.password_reset_tokens(expires_at) where used_at is null;
