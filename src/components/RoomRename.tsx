"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export default function RoomRename({ id, name }: { id: number; name: string }) {
  const router = useRouter();
  const [value, setValue] = useState(name);
  const [busy, setBusy] = useState(false);
  return (
    <div className="flex items-center gap-2">
      <input className="rounded border p-1 text-sm" value={value} onChange={(e) => setValue(e.target.value)} />
      <button
        disabled={busy}
        className="rounded bg-gray-700 px-2 py-1 text-xs text-white disabled:opacity-50"
        onClick={async () => {
          setBusy(true);
          await fetch("/api/rooms", { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ id, name: value }) });
          setBusy(false);
          router.refresh();
        }}
      >
        이름 변경
      </button>
    </div>
  );
}
