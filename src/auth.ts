import NextAuth from "next-auth";
import Google from "next-auth/providers/google";
import { isAdmin } from "@/lib/admin";

export const { handlers, auth, signIn, signOut } = NextAuth({
  providers: [Google],
  trustHost: true,
});

export async function getSessionUser() {
  const session = await auth();
  const email = session?.user?.email;
  if (!email) return null;
  return {
    email,
    name: session.user?.name ?? email,
    isAdmin: isAdmin(email),
  };
}
