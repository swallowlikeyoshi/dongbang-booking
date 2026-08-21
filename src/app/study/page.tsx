import { redirect } from "next/navigation";
import { getSessionUser } from "@/auth";
import { getMemberByEmail } from "@/lib/db/members";
import MySection from "@/components/study/MySection";
import RankingSection from "@/components/study/RankingSection";
import TeamTotalSection from "@/components/study/TeamTotalSection";
import TeamsSection from "@/components/study/TeamsSection";
import SessionButtons from "@/components/SessionButtons";

export const dynamic = "force-dynamic";

export default async function StudyPage() {
  const user = await getSessionUser();
  if (!user) redirect("/api/auth/signin?callbackUrl=/study");
  const member = getMemberByEmail(user.email);
  if (!member) redirect("/onboarding");

  return (
    <main className="mx-auto max-w-3xl p-4 sm:p-6">
      <header className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
        <h1 className="text-base font-bold sm:text-xl">HEVEN 스터디 시간</h1>
        <div className="flex items-center gap-3">
          <a href="/" className="text-sm text-blue-600">예약 시트</a>
          {user.isAdmin && <a href="/admin/study" className="text-sm text-blue-600">관리자</a>}
          <SessionButtons />
        </div>
      </header>

      {/* 세 섹션을 한 페이지에 쌓되, 위에서 바로 건너뛸 수 있게 한다. */}
      <nav className="sticky top-0 z-10 -mx-4 mt-3 flex gap-4 border-b bg-white/95 px-4 py-2 text-sm backdrop-blur sm:-mx-6 sm:px-6">
        <a href="#me" className="text-blue-600">내 스터디</a>
        <a href="#ranking" className="text-blue-600">순위</a>
        <a href="#all" className="text-blue-600">전체</a>
        <a href="#teams" className="text-blue-600">팀 현황</a>
      </nav>

      <section className="mt-6 rounded-xl border border-sky-200 bg-sky-50 p-4">
        <h2 className="text-sm font-medium text-sky-900">이렇게 쓰면 됩니다</h2>
        <ol className="mt-2 space-y-1 text-sm text-sky-900/90">
          <li><b>1.</b> 동방에 도착하면 화면의 QR을 <b>기본 카메라 앱</b>으로 찍습니다. → 시작</li>
          <li><b>2.</b> 나갈 때 같은 QR을 <b>한 번 더</b> 찍습니다. → 종료, 시간이 바로 인정됩니다.</li>
          <li><b>3.</b> QR을 못 찍고 나왔다면 상단 배너의 <b>종료</b> 버튼을 누르세요. 이 경우 관리자 확인 후 인정됩니다.</li>
        </ol>
        <p className="mt-2 text-xs text-sky-900/70">
          카카오톡 등 인앱 브라우저로 열면 로그인이 유지되지 않습니다. 기본 카메라로 찍어주세요.
          종료를 깜빡해 10시간이 넘으면 자동 마감되며, 아래 기록에서 종료 시각을 직접 신고해야 인정됩니다.
        </p>
      </section>

      <div className="mt-6 space-y-6">
        <MySection member={member} />
        <RankingSection me={member} isAdmin={user.isAdmin} />
        <TeamTotalSection />
        <TeamsSection />
      </div>
    </main>
  );
}
