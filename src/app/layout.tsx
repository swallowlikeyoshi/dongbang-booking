import "./globals.css";

export const metadata = { title: "동방 예약", description: "HEVEN 동아리방 예약" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ko">
      <body>{children}</body>
    </html>
  );
}
