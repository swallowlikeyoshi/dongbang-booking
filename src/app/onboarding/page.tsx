import { redirect } from "next/navigation";
import { getSessionUser } from "@/auth";
import { getMemberByEmail } from "@/lib/db/members";
import OnboardingForm from "@/components/attendance/OnboardingForm";

export const dynamic = "force-dynamic";

export default async function OnboardingPage({
  searchParams,
}: { searchParams: Promise<{ pending?: string }> }) {
  const { pending } = await searchParams;
  const user = await getSessionUser();
  if (!user) redirect("/api/auth/signin?callbackUrl=/onboarding");

  const member = getMemberByEmail(user.email);
  if (member) redirect(pending ? `/c/apply/${pending}` : "/study");

  return (
    <main className="mx-auto max-w-md p-6">
      <h1 className="text-2xl">학번 등록</h1>
      <p className="mt-2 mb-6 text-slate-600">스터디 시간 기록에 한 번만 필요합니다.</p>
      <OnboardingForm pending={pending ?? null} />
    </main>
  );
}
