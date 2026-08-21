import { redirect } from "next/navigation";
import { getSessionUser } from "@/auth";
import { getMemberByEmail } from "@/lib/db/members";
import ScanClient from "@/components/attendance/ScanClient";

export const dynamic = "force-dynamic";

export default async function ApplyPage({ params }: { params: Promise<{ pending: string }> }) {
  const { pending } = await params;
  const user = await getSessionUser();
  if (!user) redirect(`/api/auth/signin?callbackUrl=/c/apply/${pending}`);

  const member = getMemberByEmail(user.email);
  if (!member) redirect(`/onboarding?pending=${pending}`);

  return <ScanClient pendingId={pending} memberName={member.name} />;
}
