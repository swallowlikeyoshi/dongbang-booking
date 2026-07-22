import { auth, signIn, signOut } from "@/auth";
import GoogleIcon from "./GoogleIcon";

export default async function SessionButtons() {
  const session = await auth();
  if (session?.user) {
    return (
      <form
        className="flex items-center gap-2"
        action={async () => {
          "use server";
          await signOut({ redirectTo: "/" });
        }}
      >
        <span className="text-sm text-gray-700">{session.user.name}</span>
        <button className="rounded-md border border-gray-300 bg-white px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-50">
          로그아웃
        </button>
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
      <button className="inline-flex items-center gap-2 rounded-xl border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 shadow-sm hover:bg-gray-50">
        <GoogleIcon className="h-5 w-5" />
        로그인
      </button>
    </form>
  );
}
