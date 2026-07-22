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
| AUTH_SECRET | `npx auth secret` 로 생성 (아무 랜덤 문자열) |
| ADMIN_EMAIL | 관리자 이메일(쉼표로 다중) |
| AUTH_URL | 공개 URL. 로컬 `http://localhost:3000`, 배포 `https://<도메인>` (next-auth **v5**는 `NEXTAUTH_URL`이 아니라 `AUTH_URL`) |
| DATABASE_PATH | SQLite 경로 (컨테이너 기본 /app/data/dongbang.db) |

## 구글 OAuth 설정 (실제 로그인 활성화)
로그인은 아래 자격증명을 발급해 `.env`에 넣어야 동작한다. (코드는 설정만 넣으면 바로 작동)

1. [Google Cloud Console](https://console.cloud.google.com/) → 프로젝트 생성(또는 선택).
2. **API 및 서비스 → OAuth 동의 화면**: User Type = External, 앱 이름/지원 이메일 입력, 저장. (테스트 모드면 **테스트 사용자**에 로그인할 계정 추가.)
3. **API 및 서비스 → 사용자 인증 정보 → 사용자 인증 정보 만들기 → OAuth 클라이언트 ID → 애플리케이션 유형: 웹 애플리케이션**.
4. **승인된 리디렉션 URI**에 아래를 추가 (사용하는 환경마다):
   - 로컬: `http://localhost:3000/api/auth/callback/google`
   - 배포: `https://<도메인>/api/auth/callback/google`
5. 발급된 **클라이언트 ID / 보안 비밀**을 `.env`의 `AUTH_GOOGLE_ID` / `AUTH_GOOGLE_SECRET`에 넣는다.
6. `AUTH_SECRET`은 `npx auth secret`로 생성, `AUTH_URL`은 위 공개 URL로 설정.
7. 재시작하면 "구글 로그인" 버튼이 실제로 동작한다. (리디렉션 URI가 정확히 일치해야 하며, `http`/`https`·슬래시까지 동일해야 함.)

> 배포(젯슨 + Tailscale Funnel 등 리버스 프록시) 시: `trustHost: true`가 이미 켜져 있으므로 프록시가 `X-Forwarded-Proto/Host`를 전달하면 콜백이 정상 동작한다. `AUTH_URL`은 반드시 외부 https 도메인으로 둘 것.

## 젯슨 배포 (GHCR 이미지)
```bash
docker run -d --restart unless-stopped -p 3000:3000 \
  --env-file .env \
  -v dongbang-data:/app/data \
  ghcr.io/<owner>/dongbang-booking:latest
```
main 브랜치에 푸시하면 GitHub Actions가 arm64/amd64 이미지를 GHCR로 자동 푸시한다.
