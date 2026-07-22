"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export default function CancelButton({ id }: { id: number }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  return (
    <button
      disabled={busy}
      className="rounded bg-red-500 px-2 py-1 text-xs text-white hover:bg-red-600 disabled:opacity-50"
      onClick={async () => {
        if (!confirm("예약을 취소할까요?")) return;
        setBusy(true);
        await fetch(`/api/reservations/${id}`, { method: "DELETE" });
        router.refresh();
      }}
    >
      취소
    </button>
  );
}
