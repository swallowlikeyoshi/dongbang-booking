import { teamWeekUsage } from "@/lib/attendance/aggregate";
import { SUB_TEAM_COLORS, type SubTeam } from "@/lib/constants";
import { formatDuration } from "@/lib/attendance/format";
import { studyWeekStart } from "@/lib/week";

/** 8월 24일 형식. 주 구간을 사람이 읽을 수 있게. */
function shortDate(ts: number): string {
  const d = new Date(ts * 1000);
  return `${d.getMonth() + 1}월 ${d.getDate()}일`;
}

/**
 * 이번 주 세부팀별 쿼터 사용 현황.
 *
 * 형태는 미터(비율 대 상한)다. 팀끼리 크기를 비교하는 그래프가 아니라
 * "우리 팀이 이번 주에 얼마나 더 할 수 있나"를 보는 화면이므로, 각 팀이
 * 자기 트랙 안에서 얼마나 찼는지만 보이면 된다.
 *
 * 색은 팀 정체성(순위표·잔디와 같은 팔레트)이고, 남은 시간과 초과 여부는
 * 반드시 글자로도 쓴다 — 팔레트 검증에서 배선 및 하네스 색이 배경 대비
 * 3:1 미만(WARN)이라 색만으로 뜻을 전달해서는 안 된다.
 */
export default function QuotaSection() {
  const now = Math.floor(Date.now() / 1000);
  const weekTs = studyWeekStart(now);
  const usages = teamWeekUsage(weekTs);
  const quota = usages[0]?.quotaSeconds ?? 0;

  return (
    <section
      id="quota"
      className="scroll-mt-20 rounded-xl border border-slate-200 bg-white p-5 shadow-sm"
    >
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1 border-b border-slate-100 pb-3">
        <h2 className="text-lg font-medium">이번 주 팀 쿼터</h2>
        <span className="text-sm text-slate-500">
          {shortDate(weekTs)} ~ {shortDate(weekTs + 6 * 86400)}
        </span>
      </div>

      <p className="mt-1 text-sm text-slate-500">
        세부팀마다 주 {formatDuration(quota)}까지 인정됩니다. 팀원들이 같은 시간에
        함께 있었다면 그 시간은 한 번만 깎입니다 — 여섯 명이 여섯 시간 있었으면
        팀이 쓴 것은 36시간이 아니라 6시간입니다.
      </p>

      <ul className="mt-4 space-y-3">
        {usages.map((u) => {
          const color = SUB_TEAM_COLORS[u.team as SubTeam] ?? "#94a3b8";
          const pct = quota > 0 ? Math.min(100, (u.unionSeconds / quota) * 100) : 0;
          return (
            <li key={u.team}>
              <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5 text-sm">
                <span
                  className="inline-block h-2.5 w-2.5 shrink-0 rounded-sm"
                  style={{ background: color }}
                  aria-hidden
                />
                <span className="font-medium text-slate-700">{u.team}</span>
                <span className="ml-auto tabular-nums text-slate-500">
                  {formatDuration(u.usedSeconds)} / {formatDuration(quota)}
                </span>
              </div>

              {/* 미터: 트랙은 같은 색의 옅은 단계, 채움은 팀 색.
                  데이터 끝을 둥글게 두되 0일 때는 아무것도 그리지 않는다. */}
              <div
                className="mt-1.5 h-2 w-full overflow-hidden rounded-full"
                style={{ background: `${color}1f` }}
                role="img"
                aria-label={`${u.team} 쿼터 ${Math.round(pct)}% 사용`}
              >
                {pct > 0 && (
                  <div
                    className="h-full rounded-full"
                    style={{ width: `${pct}%`, background: color }}
                  />
                )}
              </div>

              <div className="mt-1 text-xs">
                {u.exceeded ? (
                  <span className="font-medium text-rose-700">
                    ⚠ 쿼터 초과 — {formatDuration(u.unionSeconds - quota)}은 인정되지 않습니다
                  </span>
                ) : (
                  <span className="text-slate-500">
                    {formatDuration(u.remainingSeconds)} 남음
                  </span>
                )}
              </div>
            </li>
          );
        })}
      </ul>

      <p className="mt-4 text-xs text-slate-400">
        과거 엑셀에서 옮겨온 기록은 세부팀장이 이미 쿼터를 맞춰 적은 값이라 이
        계산에 들어가지 않습니다. QR로 찍은 기록만 집계합니다.
      </p>
    </section>
  );
}
