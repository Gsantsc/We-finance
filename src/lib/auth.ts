import { NextAuthOptions } from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import bcrypt from "bcryptjs";
import { getUserByEmail, getHouseholdIdForUser } from "./repo";

export const authOptions: NextAuthOptions = {
  session: { strategy: "jwt" },
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

        const user = await getUserByEmail(credentials.email.trim().toLowerCase());
        if (!user) return null;

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
