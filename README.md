# Supa Calendar

프로젝트 일정을 한눈에 관리하는 웹앱입니다. 캘린더 그리드, 간트 차트, 워크로드 히트맵 세 가지 뷰를 제공하며, Supabase Realtime으로 팀원 간 실시간 동시 편집을 지원합니다.

## Demo

아래 데모 계정으로 바로 체험할 수 있습니다 (읽기 전용):

| 항목 | 값 |
|------|-----|
| URL | [supa-calendar.vercel.app](https://supa-calendar.vercel.app) |
| Email | `guest@gmail.com` |
| Password | `guest1234` |

> 데모 계정은 데이터 조회만 가능하며, 생성/수정/삭제는 제한됩니다.

## Features

### Calendar Grid View

행은 프로젝트, 열은 날짜, 셀은 일정입니다.

- 더블클릭으로 셀 인라인 편집, 우클릭으로 상세 모달
- Cmd+X/C/V 셀 단위 잘라내기/복사/붙여넣기
- Ctrl+Z / Shift+Z 실행 취소/재실행 (최대 50단계)
- 키워드별 색상 마킹 (출고, N차 공유 등)
- 시간 지정 일정은 셀 상단 고정 + 좌측 네이비 보더
- 지난 일정 자동 스택 처리 (opacity + 카운트 뱃지)

### Gantt Chart View

프로젝트 기간을 타임라인 바로 시각화합니다.

- 바 드래그로 기간 이동/리사이즈, 빈 영역 드래그로 신규 생성
- 시나리오 비교 — 낙관/비관/대안 시나리오를 얇은 색상 라인으로 오버레이
- 스케줄 마커 (다이아몬드) 표시/이동
- 한눈 모드 — 셀 폭 축소 + 키워드 히트맵 컬럼
- PNG 이미지 + Excel 내보내기

### Workload View

행은 팀원, 열은 날짜, 셀은 배정된 일정입니다.

- 히트맵 (1~2건 초록, 3~4건 주황, 5건+ 빨강)
- 카드 드래그로 담당자 재배정
- 브랜드 색상 도트 + 프로젝트명 카드

### Project Management

브랜드 > 프로젝트 > 하위 프로젝트 계층 구조를 트리로 관리합니다.

- 드래그 앤 드랍 정렬 (같은 브랜드 내)
- 상태 관리 (진행전/진행중/보류/완료/드랍)
- 역할별 담당자 배정 (동적 역할 시스템)

### Realtime Collaboration

- 실시간 동시 편집 — 다른 사용자의 변경이 자동 반영
- Presence — 접속 중인 사용자 아바타 표시, 현재 보고 있는 셀/행 하이라이트

### Attendance

날짜별 장소+참석자를 기록합니다. 미니 캘린더에서 날짜 선택, 장소 카드에서 멤버 토글.

### Settings

브랜드, 멤버, 역할을 인라인 편집으로 관리합니다.

- **브랜드** — 코드, 이름, 색상, 정렬 순서
- **멤버** — 이름, 직책, 이메일, 활성/비활성 (삭제 대신 비활성화)
- **역할** — key, 라벨, 색상, 정렬 순서 (동적 추가/소프트 삭제)

## Tech Stack

| 분류 | 기술 |
|------|------|
| Framework | Next.js 16 · React 19 · TypeScript |
| Database | Supabase (PostgreSQL + Realtime + Auth) |
| Styling | Tailwind CSS 4 · Glass UI |
| Font | Pretendard Variable (한국어 최적화) |
| Export | html2canvas-pro (PNG) · SheetJS (Excel) |

---

## Getting Started

이 가이드를 따라 하면 로컬 개발 서버부터 Vercel 배포까지 완료할 수 있습니다.

### Step 1. 프로젝트 클론 및 의존성 설치

```bash
git clone https://github.com/Epikoding/supa-calendar.git
cd supa-calendar
npm install
```

### Step 2. Supabase 프로젝트 생성

1. [supabase.com](https://supabase.com)에 가입/로그인합니다
2. 대시보드에서 **New Project** 클릭
3. Organization 선택, 프로젝트 이름 입력, **Database Password** 설정, Region은 `Northeast Asia (Seoul)`을 선택합니다
4. 프로젝트 생성이 완료될 때까지 1~2분 기다립니다

### Step 3. 데이터베이스 스키마 생성

Supabase 대시보드 > 좌측 메뉴 **SQL Editor** 클릭 > **New query** 버튼을 누르고 아래 순서대로 실행합니다:

**3-1. 테이블 생성**

`supabase/ddl.sql` 파일의 전체 내용을 복사 → SQL Editor에 붙여넣기 → **Run** 클릭

이 파일이 생성하는 것:
- 11개 테이블 (brands, members, projects, project_roles, project_members, schedule, schedule_assignees, attendance, attendance_members, project_links)
- 기본 역할 시드 데이터 (designer, pm)
- 인덱스 6개
- updated_at 자동 갱신 트리거
- `batch_move_items` RPC 함수 (일정 일괄 이동용)

**3-2. Row Level Security (RLS) 설정**

새 쿼리를 열고, `supabase/rls.sql` 파일의 전체 내용을 복사 → 붙여넣기 → **Run** 클릭

이 파일이 설정하는 것:
- 모든 테이블에 RLS 활성화
- 로그인한 사용자(authenticated): 전체 CRUD 허용
- 비로그인 사용자(anon): 읽기만 허용

### Step 4. Realtime 활성화

실시간 동시 편집을 위해 Supabase Realtime Publication에 테이블을 등록해야 합니다. SQL Editor에서 아래를 실행합니다:

```sql
alter publication supabase_realtime add table brands;
alter publication supabase_realtime add table members;
alter publication supabase_realtime add table projects;
alter publication supabase_realtime add table project_roles;
alter publication supabase_realtime add table project_members;
alter publication supabase_realtime add table schedule;
alter publication supabase_realtime add table schedule_assignees;
alter publication supabase_realtime add table scenario_schedules;
alter publication supabase_realtime add table attendance;
alter publication supabase_realtime add table attendance_members;
alter publication supabase_realtime add table project_links;
```

### Step 5. 사용자 등록

Supabase는 이메일+비밀번호 인증을 사용합니다. 사용할 계정을 먼저 만들어야 합니다.

1. Supabase 대시보드 > **Authentication** > **Users**
2. **Add user** > **Create new user** 클릭
3. Email과 Password 입력 후 **Create user** 클릭
4. 필요한 만큼 반복 (팀원 수만큼)

> 여기서 만든 이메일/비밀번호로 앱에 로그인합니다.

### Step 6. 환경변수 설정

프로젝트 루트의 `.env.example` 파일을 복사한 뒤, 이름을 `.env.local`로 변경합니다. 그리고 파일을 열어 Supabase URL과 API 키를 입력합니다:

```
NEXT_PUBLIC_SUPABASE_URL=https://your-project-ref.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
```

**찾는 방법:**

Supabase 대시보드 > **Project Settings** > **API Keys**에서 확인할 수 있습니다:
- **Project URL** → `NEXT_PUBLIC_SUPABASE_URL`
- **Legacy anon, service_role API keys** > `anon` → `NEXT_PUBLIC_SUPABASE_ANON_KEY`

### Step 7. 샘플 데이터 넣기 (선택)

빈 앱 대신 더미 데이터로 시작하고 싶다면, `scripts/data/` 디렉토리의 CSV 파일을 Supabase에 업로드합니다.

1. Supabase 대시보드 > **Table Editor**에서 테이블 선택
2. 상단 **Import data from CSV** 클릭
3. 아래 순서대로 CSV 파일을 업로드 (FK 참조 순서):

| 순서 | 파일 | 테이블 | 내용 |
|------|------|--------|------|
| 1 | `brands.csv` | brands | 브랜드 5개 |
| 2 | `members.csv` | members | 멤버 6명 |
| 3 | `projects.csv` | projects | 프로젝트 20개 |
| 4 | `project_members.csv` | project_members | 프로젝트-멤버 배정 |
| 5 | `scenarios.csv` | scenarios | 시나리오 4개 |
| 6 | `schedule.csv` | schedule | 일정 24개 |
| 7 | `schedule_assignees.csv` | schedule_assignees | 일정-담당자 매핑 |
| 8 | `scenario_schedules.csv` | scenario_schedules | 시나리오별 기간 8개 |
| 9 | `attendance.csv` | attendance | 출근 기록 |
| 10 | `attendance_members.csv` | attendance_members | 출근-멤버 매핑 |
| 11 | `keyword_highlights.csv` | keyword_highlights | 키워드 하이라이트 4개 |

> CSV 파일을 편집하면 원하는 데이터로 변경할 수 있습니다.

### Step 8. 개발 서버 실행

```bash
npm run dev
```

http://localhost:3000 에 접속하여 Step 5에서 만든 계정으로 로그인한 뒤, 각 기능이 정상 동작하는지 테스트해보세요.

---

## Vercel에 배포하기

### Step 1. GitHub에 Push

```bash
git add -A
git commit -m "initial setup"
git push origin main
```

### Step 2. Vercel 프로젝트 생성

1. [vercel.com](https://vercel.com)에 GitHub 계정으로 로그인
2. **Add New** > **Project** 클릭
3. GitHub에서 `supa-calendar` 저장소를 **Import** 선택
4. **Framework Preset**이 `Next.js`로 자동 감지되는지 확인
5. **Environment Variables**에 `.env.local`에 설정한 값들을 동일하게 추가 (`NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`)
6. **Deploy** 클릭

배포가 완료되면 `https://your-project.vercel.app` 주소가 생성됩니다.

### Step 3. Supabase Redirect URL 설정

Vercel 배포 후, Supabase Auth가 프로덕션 URL을 인식하도록 설정합니다:

1. Supabase 대시보드 > **Authentication** > **URL Configuration**
2. **Site URL**을 Vercel 배포 주소로 변경: `https://your-project.vercel.app`
3. **Redirect URLs**에 추가: `https://your-project.vercel.app/**`
4. 커스텀 도메인을 사용할 경우 해당 도메인도 추가

### 자동 배포

설정 완료 후 `main` 브랜치에 push하면 Vercel이 자동으로 빌드+배포합니다.

---

## Customization

### 테마 및 라벨

`.env.local`에서 환경변수를 설정하면 앱 이름, 색상, 라벨을 변경할 수 있습니다:

| 환경변수 | 기본값 | 설명 |
|---------|--------|------|
| `NEXT_PUBLIC_APP_NAME` | `Calendar` | 앱 이름 (NavBar, 로그인, 브라우저 탭) |
| `NEXT_PUBLIC_PRIMARY_COLOR` | `#09338F` | 테마 기본 색상 (hex). 파생 색상 자동 생성 |
| `NEXT_PUBLIC_BRAND_LABEL` | `Brand` | 프로젝트 그룹 라벨 (툴바 필터, 설정, 내보내기) |

> Vercel에 배포할 경우 Vercel 대시보드 > Settings > Environment Variables에도 동일하게 추가하세요.

### 역할 관리

프로젝트 담당자 역할은 **설정 > 역할 탭**에서 관리합니다.

- 기본 제공: `designer`, `pm`
- 역할을 자유롭게 추가하고, key/label/색상을 지정
- 비활성화된 역할은 신규 배정 시 숨겨지지만, 기존 배정 데이터는 유지
- role key 변경 시 기존 배정이 `ON UPDATE CASCADE`로 자동 전파

### Slack 연동 (선택)

프로젝트별 Slack 링크를 관리하려면 Slack User Token이 필요합니다.

1. [api.slack.com/apps](https://api.slack.com/apps)에서 앱 생성
2. **OAuth & Permissions** > **User Token Scopes**에 아래 추가:
   - `channels:history` — 채널 메시지 읽기
   - `channels:read` — 채널 정보 읽기
   - `users:read` — 사용자 정보 읽기
3. 워크스페이스에 앱 설치 후 **User OAuth Token** (xoxp-...) 복사
4. `.env.local`에 추가:

```
SLACK_USER_TOKEN=xoxp-your-slack-user-token
```

Slack URL을 붙여넣으면 메시지 내용/작성자/날짜를 자동으로 가져옵니다. 토큰 없이도 URL 저장은 가능합니다.

---

## DB Schema

```
brands              -- 브랜드 (프로젝트 그룹)
members             -- 팀원
projects            -- 프로젝트 (브랜드별, parent_id로 계층 구조)
project_roles       -- 역할 정의 (designer, pm, ...)
project_members     -- 프로젝트-멤버-역할 매핑
schedule            -- 날짜별 일정
schedule_assignees  -- 일정-담당자 매핑
scenarios           -- 시나리오 정의
scenario_schedules  -- 시나리오별 프로젝트 기간
attendance          -- 출근 기록 (날짜+장소)
attendance_members  -- 출근-멤버 매핑
project_links       -- 프로젝트-Slack 링크
```

## Project Structure

```
src/
├── app/              -- 라우트 페이지
├── components/
│   ├── calendar/     -- 캘린더 그리드뷰 + hooks
│   ├── gantt/        -- 간트 차트 + hooks
│   ├── workload/     -- 워크로드뷰
│   ├── projects/     -- 프로젝트 트리
│   ├── attendance/   -- 출근 관리
│   ├── settings/     -- 설정 (브랜드/멤버/역할)
│   ├── shared/       -- 공통 컴포넌트 (GlassPanel, BrandFilter, ...)
│   └── layout/       -- NavBar, Providers
├── hooks/            -- 공통 훅 (useUndoStack, useRealtimeSync, ...)
├── lib/
│   ├── supabase/     -- Supabase 클라이언트 (client, server, middleware)
│   ├── types/        -- TypeScript 타입
│   ├── queries/      -- Supabase 쿼리 함수
│   ├── utils/        -- 유틸리티 (tree, calendar, project, ...)
│   ├── config.ts     -- 환경변수 기반 설정
│   └── colors.ts     -- 테마 색상
└── middleware.ts      -- Auth 라우트 보호

scripts/
├── data/             -- 샘플 CSV
├── import-csv.mjs    -- CSV → Supabase 임포트
└── import.sql        -- 샘플 데이터 SQL

supabase/
├── ddl.sql           -- 테이블 생성 DDL
└── rls.sql           -- Row Level Security
```

## Known Limitations

- 한국어 전용 UI (상태값: 진행전/진행중/보류/완료/드랍)
- `color-mix()` CSS 사용 — 2023년 이전 브라우저 미지원
- Pretendard 폰트 (한국어 최적화) — 필요시 `src/app/layout.tsx`에서 CDN 링크 교체

## License

MIT
