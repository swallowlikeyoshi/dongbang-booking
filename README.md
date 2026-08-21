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
| TZ | 시간대. 이미지에 `Asia/Seoul` 기본 설정. **UTC로 두면 주 시작·예약 시각이 9시간 어긋난다** |

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

## 스터디 시간 기록

설계: `docs/superpowers/specs/2026-08-21-study-time-tracking-design.md`

개인정보 취급 주의: 아래 절차에서 만들어지는 `data/roster.csv`(학번 원장)와
`firmware/study-qr/src/config.h`(장비 시크릿)는 **repo 에 절대 커밋하지 않는다**.
둘 다 `.gitignore`에 이미 등록되어 있다.

### 최초 설정 (순서대로)

```bash
# 1. 학번 원장 CSV 생성 — data/ 아래에만 둔다. repo 에 커밋 금지.
uvx --from openpyxl python scripts/roster-to-csv.py \
  "$HOME/Downloads/2026년 1학기 헤븐 활동 회원 명부.xlsx" \
  "$HOME/Downloads/2026 스터디 참여시간-3.xlsx"

# 2. 마이그레이션 → 시드 (이 순서로. 시드 대상은 세부팀이 배정된 전기팀원 58명)
npm run migrate && npm run seed:members

# 3. .env 에 ATTENDANCE_DEVICE_SECRETS 설정 후 재시작
#    (장비 2대 = room_id 1: 공학실습동 24214, room_id 2: 학생회관 03324)
```

장비 펌웨어는 `firmware/study-qr/` 참조 — `src/config.h.example`을 `src/config.h`로
복사하고 값을 채운다(`config.h`도 커밋 금지). 장비의 `DEVICE_SECRET`은
`ATTENDANCE_DEVICE_SECRETS`의 해당 방 시크릿과 같아야 한다. 화면 문구가 전부 영문인
이유와 "기본 카메라로 스캔" 같은 한글 안내를 인쇄 라벨로 대체하는 이유는
`firmware/study-qr/README.md`를 참조.

### 화면

| 경로 | 내용 |
|------|------|
| `/c/<코드>` | QR 스캔 진입점. 체크인/체크아웃 자동 판정 |
| `/c/apply/<pending>` | 미확정 신고 접수 |
| `/onboarding` | 학번 등록 (최초 1회) |
| `/study` | 내 현황 — 잔디, 기록, 수정 이력, 미확정 신고 |
| `/study/ranking` | 전체 순위 (엔트리 컷 라인) |
| `/study/teams` | 세부팀별 히트맵 |
| `/admin/study` | 승인 큐, 장비 상태, 설정, CSV 내보내기 |
