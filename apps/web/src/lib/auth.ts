import type { NextAuthOptions } from 'next-auth';
import KeycloakProvider from 'next-auth/providers/keycloak';

export const authOptions: NextAuthOptions = {
  providers: [
    KeycloakProvider({
      clientId: process.env.NEXT_PUBLIC_KEYCLOAK_CLIENT_ID ?? 'gain-web',
      clientSecret: process.env.KEYCLOAK_WEB_CLIENT_SECRET ?? '',
      issuer: `${process.env.NEXT_PUBLIC_KEYCLOAK_URL ?? 'http://localhost:8080'}/realms/${
        process.env.NEXT_PUBLIC_KEYCLOAK_REALM ?? 'gain'
      }`,
    }),
  ],
  session: { strategy: 'jwt' },
  callbacks: {
    async jwt({ token, account }) {
      if (account?.access_token) {
        token.accessToken = account.access_token;
        token.refreshToken = account.refresh_token;
        token.expiresAt = account.expires_at;
      }
      return token;
    },
    async session({ session, token }) {
      session.accessToken = token.accessToken as string | undefined;
      return session;
    },
  },
  pages: {
    signIn: '/login',
  },
};
