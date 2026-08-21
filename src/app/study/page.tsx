import { redirect } from "next/navigation";
import { getSessionUser } from "@/auth";
import { getMemberByEmail } from "@/lib/db/members";
import MySection from "@/components/study/MySection";
import RankingSection from "@/components/study/RankingSection";
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
        <a href="#teams" className="text-blue-600">팀 현황</a>
      </nav>

      <div className="mt-6 space-y-10">
        <MySection member={member} />
        <RankingSection me={member} />
        <TeamsSection />
      </div>
    </main>
  );
}
