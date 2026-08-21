import { redirect } from "next/navigation";
import { getSessionUser } from "@/auth";
import { loadDevices, verifyCode } from "@/lib/attendance/code";
import { createPendingScan } from "@/lib/attendance/scan";
import { getMemberByEmail } from "@/lib/db/members";
import ScanClient from "@/components/attendance/ScanClient";

export const dynamic = "force-dynamic";

export default async function ScanPage({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  const ts = Math.floor(Date.now() / 1000);
  const match = verifyCode(code, ts, loadDevices());

  if (!match) {
    return (
      <main className="mx-auto max-w-md p-6">
        <h1 className="text-xl">코드가 만료되었습니다</h1>
        <p className="mt-2 text-slate-600">동방 화면의 새 QR을 다시 스캔해주세요.</p>
      </main>
    );
  }

  // 코드 검증은 여기서 끝난다. 이후 로그인·온보딩에 시간이 걸려도 증명 시각은 지금이다.
  const pendingId = createPendingScan(match, ts);

  const user = await getSessionUser();
  if (!user) redirect(`/api/auth/signin?callbackUrl=/c/apply/${pendingId}`);

  const member = getMemberByEmail(user.email);
  if (!member) redirect(`/onboarding?pending=${pendingId}`);

  return <ScanClient pendingId={pendingId} memberName={member.name} />;
}
