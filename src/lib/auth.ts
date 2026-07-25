import { NextAuthOptions } from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import bcrypt from "bcryptjs";
import { getUserByEmail, getHouseholdIdForUser } from "./repo";
import { rateLimit } from "./ratelimit";

// Hash de senha inexistente: comparado quando o email nao esta cadastrado,
// para o tempo de resposta nao entregar se o email existe ou nao.
const HASH_DUMMY = "$2a$10$XKPYdKY0jXCLl0M6t0iC/uXNvxU3AcXo8W4W6FZ35cW0eLROOMEim";

export const authOptions: NextAuthOptions = {
  // 7 dias (em vez dos 30 padrao): app financeiro, sessao mais curta.
  session: { strategy: "jwt", maxAge: 7 * 24 * 60 * 60 },
  pages: { signIn: "/login" },
  providers: [
    CredentialsProvider({
      name: "Credenciais",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Senha", type: "password" },
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.password) return null;
        const email = credentials.email.trim().toLowerCase();

        // Com a senha inicial padrao sendo publica, brute force de login e o
        // caminho obvio de sequestro - 5 tentativas por email a cada 15 min.
        if (!rateLimit(`login:${email}`, 5, 15 * 60 * 1000)) {
          throw new Error("MUITAS_TENTATIVAS");
        }

        const user = await getUserByEmail(email);
        if (!user) {
          await bcrypt.compare(credentials.password, HASH_DUMMY);
          return null;
        }

        const valid = await bcrypt.compare(credentials.password, user.passwordHash);
        if (!valid) return null;

        // Sem email confirmado nao entra - e o clique no link que prova que o
        // email e' da pessoa (a senha padrao sozinha nao prova nada).
        if (!user.emailVerifiedAt) {
          throw new Error("EMAIL_NAO_VERIFICADO");
        }

        return {
          id: user.id,
          name: user.name,
          email: user.email,
          mustChangePassword: !!user.mustChangePassword,
        } as any;
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user, trigger }) {
      if (user) {
        token.id = (user as any).id;
        token.mustChangePassword = (user as any).mustChangePassword;
        token.householdId = await getHouseholdIdForUser((user as any).id);
      }
      // Depois da troca de senha a tela chama update() na sessao - reconsulta
      // o banco para o token nao ficar preso no mustChangePassword antigo.
      if (trigger === "update" && token.id) {
        const { getUserById } = await import("./repo");
        const fresh = await getUserById(token.id as string);
        if (fresh) token.mustChangePassword = !!fresh.mustChangePassword;
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        (session.user as any).id = token.id as string;
        (session.user as any).householdId = token.householdId as string | null;
        (session.user as any).mustChangePassword = !!token.mustChangePassword;
      }
      return session;
    },
  },
  secret: process.env.NEXTAUTH_SECRET,
};
