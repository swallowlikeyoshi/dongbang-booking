"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export default function CancelButton({
  id,
  isRecurring = false,
}: {
  id: number;
  isRecurring?: boolean;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function cancel(scope: "one" | "series") {
    const message =
      scope === "series"
        ? "이 일정과 이후의 모든 반복 일정을 취소할까요?"
        : "예약을 취소할까요?";
    if (!confirm(message)) return;
    setBusy(true);
    const url = scope === "series" ? `/api/reservations/${id}?scope=series` : `/api/reservations/${id}`;
    await fetch(url, { method: "DELETE" });
    setBusy(false);
    router.refresh();
  }

  return (
    <span className="flex shrink-0 flex-col gap-1">
      <button
        disabled={busy}
        className="rounded bg-red-500 px-2 py-1 text-xs text-white hover:bg-red-600 disabled:opacity-50"
        onClick={() => cancel("one")}
      >
        {isRecurring ? "이 일정만" : "취소"}
      </button>
      {isRecurring && (
        <button
          disabled={busy}
          className="whitespace-nowrap rounded border border-red-500 px-2 py-1 text-xs text-red-600 hover:bg-red-50 disabled:opacity-50"
          onClick={() => cancel("series")}
        >
          이후 전체
        </button>
      )}
    </span>
  );
}
