"use client";

import { useEffect, useState } from "react";

export default function InAppBrowserNotice() {
  const [inApp, setInApp] = useState(false);

  useEffect(() => {
    const ua = navigator.userAgent;
    setInApp(/KAKAOTALK|NAVER\(inapp|Instagram|FBAN|FBAV|Line\//i.test(ua));
  }, []);

  if (!inApp) return null;

  return (
    <div className="bg-amber-50 px-4 py-2 text-sm text-amber-900">
      인앱 브라우저에서는 로그인이 유지되지 않습니다. 기본 카메라 앱으로 QR을 스캔하거나, 이 페이지를 외부 브라우저로 열어주세요.
    </div>
  );
}
