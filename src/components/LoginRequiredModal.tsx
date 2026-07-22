"use client";

import { signIn } from "next-auth/react";
import GoogleIcon from "./GoogleIcon";

export default function LoginRequiredModal({ onClose }: { onClose: () => void }) {
  return (
    <div
      className="fixed inset-0 z-20 flex items-center justify-center bg-black/30 p-4"
      onClick={onClose}
    >
      <div
        className="w-80 rounded-xl border border-gray-200 bg-white p-5 shadow-lg"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="mb-2 text-base font-semibold text-gray-900">로그인이 필요합니다</h3>
        <p className="mb-5 text-sm text-gray-600">
          예약을 하려면 구글 계정으로 로그인해 주세요.
        </p>
        <div className="flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="rounded-md border border-gray-300 bg-white px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-50"
          >
            닫기
          </button>
          <button
            type="button"
            onClick={() => signIn("google")}
            className="inline-flex items-center gap-2 rounded-xl border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 shadow-sm hover:bg-gray-50"
          >
            <GoogleIcon className="h-5 w-5" />
            로그인
          </button>
        </div>
      </div>
    </div>
  );
}
