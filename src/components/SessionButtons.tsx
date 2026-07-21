import { auth, signIn, signOut } from "@/auth";

export default async function SessionButtons() {
  const session = await auth();
  if (session?.user) {
    return (
      <form
        action={async () => {
          "use server";
          await signOut({ redirectTo: "/" });
        }}
      >
        <span className="mr-2 text-sm">{session.user.name}</span>
        <button className="rounded bg-gray-200 px-3 py-1 text-sm">로그아웃</button>
      </form>
    );
  }
  return (
    <form
      action={async () => {
        "use server";
        await signIn("google", { redirectTo: "/" });
      }}
    >
      <button className="rounded bg-blue-600 px-3 py-1 text-sm text-white">구글 로그인</button>
    </form>
  );
}
