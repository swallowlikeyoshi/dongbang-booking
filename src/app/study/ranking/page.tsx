import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getSessionUser } from "@/auth";
import { getMemberByEmail } from "@/lib/db/members";
import RankingSection from "@/components/study/RankingSection";

export const dynamic = "force-dynamic";

// 링크를 아는 사람에게 보여주려는 것이지 검색으로 발견되게 하려는 것은 아니다.
export const metadata: Metadata = { robots: { index: false, follow: false } };

/**
 * 순위표 공개 페이지.
 *
 * 다른 팀 임원진에게 보여주기 위해 로그인 없이 열린다. 학번은 노출하지 않으며
 * 이름·세부팀·참여 대회·인정 시간만 보여준다. 관리자 드롭다운은 로그인한
 * 관리자에게만 렌더된다.
 *
 * 로그인한 팀원은 세 섹션이 한 페이지에 있는 /study 로 보낸다.
 */
export default async function RankingPage() {
  const user = await getSessionUser();
  if (user) redirect("/study#ranking");

  return (
    <main className="mx-auto max-w-3xl p-4 sm:p-6">
      <header className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1 border-b border-slate-200 pb-3">
        <h1 className="text-base font-bold sm:text-xl">HEVEN 전기팀 스터디 시간</h1>
        <a href="/api/auth/signin?callbackUrl=/study" className="text-sm text-blue-600">
          팀원 로그인
        </a>
      </header>

      <div className="mt-5">
        <RankingSection me={null} isAdmin={false} bare />
      </div>

      <p className="mt-6 text-xs text-slate-400">
        동방 문 앞의 QR 을 스캔해 기록된 시간입니다. 팀원은 로그인하면 본인 기록과
        팀별 현황을 함께 볼 수 있습니다.
      </p>
    </main>
  );
}
