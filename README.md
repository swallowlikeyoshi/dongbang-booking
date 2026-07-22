# 동방 예약

HEVEN 동아리방 2개를 30분 슬롯 단위로 예약하는 셀프호스팅 웹앱. Next.js + SQLite + Auth.js(Google).

## 로컬 개발
```bash
npm install
cp .env.example .env   # 값 채우기
npm run migrate        # DB 생성 + 방 2개 시드
npm run dev
```

## 환경변수
| 변수 | 설명 |
|------|------|
| AUTH_GOOGLE_ID / AUTH_GOOGLE_SECRET | 구글 OAuth 클라이언트 |
| AUTH_SECRET | `npx auth secret` 로 생성 |
| ADMIN_EMAIL | 관리자 이메일(쉼표로 다중) |
| NEXTAUTH_URL | 배포 도메인 (예: https://dongbang.tailXXXX.ts.net) |
| DATABASE_PATH | SQLite 경로 (컨테이너 기본 /app/data/dongbang.db) |

## 구글 OAuth 설정
Google Cloud Console → OAuth 클라이언트(웹) →
승인된 리디렉션 URI: `{NEXTAUTH_URL}/api/auth/callback/google`

## 젯슨 배포 (GHCR 이미지)
```bash
docker run -d --restart unless-stopped -p 3000:3000 \
  --env-file .env \
  -v dongbang-data:/app/data \
  ghcr.io/<owner>/dongbang-booking:latest
```
main 브랜치에 푸시하면 GitHub Actions가 arm64/amd64 이미지를 GHCR로 자동 푸시한다.
