# HEVEN 동아리방 예약 시트

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

## 운영 메모

### `.env`를 수정했다면 컨테이너를 **재생성**할 것
`docker restart`는 `--env-file`을 다시 읽지 않는다(환경변수는 컨테이너 생성 시점에 고정). 값이 반영되지 않고 조용히 예전 값으로 동작한다.

```bash
docker rm -f dongbang
docker run -d --name dongbang --restart unless-stopped \
  --runtime=runc \
  -p 127.0.0.1:3001:3000 \
  --env-file ~/dongbang/.env \
  -v dongbang-data:/app/data \
  ghcr.io/<owner>/dongbang-booking:latest
```
DB는 `dongbang-data` 볼륨에 있으므로 재생성해도 예약 데이터는 보존된다.

### 젯슨(Jetson Nano)에서는 `--runtime=runc` 필수
기본 런타임이 `nvidia`로 설정돼 있고 깨져 있어(`exec format error`) 지정하지 않으면 컨테이너가 뜨지 않는다.

### `AUTH_SECRET`을 바꾸면 기존 로그인 세션이 모두 무효화된다
사용자는 다시 로그인하면 된다. 예약 데이터에는 영향 없음.

### 한 대에 여러 서비스 (Tailscale Funnel)
Funnel은 443 / 8443 / 10000만 지원한다. 예: ksae-notice가 443을 쓰면 이 앱은 8443.
```bash
tailscale funnel --bg --https=8443 http://127.0.0.1:3001
```
`AUTH_URL`과 구글 콘솔의 리디렉션 URI에 **포트까지** 포함해야 한다.
