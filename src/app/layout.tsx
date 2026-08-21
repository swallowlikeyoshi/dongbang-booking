import "./globals.css";
import ActiveSessionBanner from "@/components/attendance/ActiveSessionBanner";
import InAppBrowserNotice from "@/components/attendance/InAppBrowserNotice";

export const metadata = {
  title: "HEVEN 동아리방 예약 시트",
  description: "HEVEN 동아리방(공학실습동·학생회관) 예약 시트",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ko">
      <body>
        <InAppBrowserNotice />
        <ActiveSessionBanner />
        {children}
      </body>
    </html>
  );
}
