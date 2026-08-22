# Nekan — 에이전트용 프로젝트 노트

아이젠하워 매트릭스 데스크톱 위젯. Electron 43, 빌드는 electron-builder.
**사용자 대상 기능 설명은 `README.md`에 있음. 이 파일은 중복하지 않고, 코드를 읽어서는 알기 어려운 것만 적는다.**

## 아키텍처 한 줄 요약

```
src/               쓰는 곳. TypeScript다 — 도는 것은 out/이다 (아래 "빌드")
  main.ts          앱 생명주기와 조립만 — store 로드 → IPC 등록 → 창 생성 순서가 전부
  main/
    store.ts       메모리 위의 data.json + 디바운스 저장 (persist / persistNow)
    store-io.ts    data.json 읽기/쓰기. fs를 쓰므로 shared가 아니라 여기 있다
    window.ts      창 생성과 expanded/collapsed 전환. 패널 두 개는 모른다
    export-service.ts  PDF·HTML·MD 쓰기 (숨은 창에서 printToPDF)
    updater.ts     electron-updater. 창을 모르고, main.ts가 넘긴 콜백으로만 알린다
    api-client.ts  Supabase와 말하는 유일한 곳. URL·anon key·로그인·토큰 갱신·시계 오차
    token-store.ts 세션을 safeStorage로 암호화해 userData/auth.json에 (data.json 아님)
    sync.ts        당기고 밀고 다시 시도하는 루프. 판정은 안 하고 일정만 잡는다
    oauth.ts       Google 로그인의 브라우저 쪽 (PKCE + loopback). 세션은 모른다
    ipc.ts         ipcMain.handle 전부. 새 채널을 만들 때 첫 번째로 여는 파일
    i18n.ts        메인 쪽 i18next. 렌더러와 따로 산다 (프로세스가 다르다)
  preload.ts       contextBridge → window.api. 그 객체의 `typeof`가 렌더러의 타입이다
  shared/          메인·렌더러·테스트가 공유. 여기만 테스트가 덮는다
    types.ts       Task · Place · Space · Layout · Session · DueInfo · Rect 등 어휘
    core.ts        날짜·정규화·space 규칙·레이아웃 비율 등 순수 로직
    export.ts      내보내기 문서 생성 (마크다운·인쇄용 HTML). 메인·테스트만 쓴다
    sync.ts        동기화 판정 (LWW·행 변환·커서·시계 오차). main/sync.ts가 쓴다
    auth.ts        세션 모양과 만료 판정. 렌더러에 나갈 필드를 여기서 고른다
    i18n/          ko.json · en.json · GLOSSARY.md · locales.ts (지원 목록과 기본값)
  renderer/        ES 모듈. 번들러 없음 — import 경로에 `.js` 확장자를 반드시 쓴다
    index.html     정적 마크업. <link> 15개와 <script> 하나
    app.ts         진입점. render() 디스패처, 전역 단축키, init() 조립
    i18n.ts        렌더러 쪽 i18next. t · tNodes · applyStaticStrings · setLanguage
    store.ts       tasks 배열과 모든 변경. DOM을 모른다 → commit()이 저장+notify
    render-bus.ts  "다시 그려라" 신호 하나. store·view → app 순환을 막는 장치
    dom.ts         $ · $$ · target · numEl · actionBtn · labelBtn
    window-api.d.ts  window.api를 preload의 `typeof api`에서 받아 전역으로 선언
    components/    icons · due-chip · memo-mark · toast (task를 모르는 조각들)
    views/         matrix · inbox · archive · memo · inline-edit · account · settings · welcome
    window/        chrome(타이틀바·탭·모드) · layout(분면 경계) · dnd · export-ui
    styles/        base부터 scrollbars까지 15개. index.html의 <link> 순서가 캐스케이드
                   switch.css만 영역이 아니라 부품이다 — 두 곳이 쓰므로 base 바로 뒤
test/              node --test 용 단위 테스트 (shared/ 와 store-io만 커버)
out/               `npm run build`가 만든다. 앱이 실제로 읽는 것은 전부 여기다
tools/build.js     tsc 네 번 + 자산 22개 복사 + 고아 산출물 삭제
```

**빌드가 있다.** `src/`는 쓰는 곳이고 **도는 것은 `out/`이다** — `package.json`의 `main`도,
electron-builder가 싣는 것도 거기다. `npm start`·`npm test`·`npm run dist` 앞에 빌드가 붙어
있어 평소에는 의식할 일이 없지만, **`src/`를 고치고 앱만 다시 띄우면 옛 코드가 돈다.**
`npm run build:watch`가 두 컴파일러를 watch로 띄우고 자산도 따라 복사한다.

**tsconfig가 넷이고 각자 이유가 있다.**

- `tsconfig.shared.json` — `src/shared/`를 **ES 모듈로** 내보낸다. 그리고 **규칙이다**:
  `types: []` + DOM lib 없음이라 여기서 `fs`나 `document`를 만지면 **컴파일이 죽는다.**
  `strict`도 여기만 켜져 있다 — 159개 테스트가 이 파일들을 덮고 있어서 컴파일러가 요구하는
  수정에 안전망이 있다.
- `tsconfig.main.json` — 메인과 preload. CommonJS. `composite`이라 선언 파일을 내보내고,
  렌더러가 그걸로 `window.api`의 타입을 얻는다.
- `tsconfig.renderer.json` — `module: "preserve"`. **import 경로를 tsc가 다시 쓰지 않게
  하는 것이 이 설정의 전부다** — 번들러가 없어 브라우저가 적힌 그대로 읽는다.
- `tsconfig.test.json` — `out/test/`로 나간다. 테스트는 `#shared/*`·`#main/*`로 import한다
  (`package.json`의 `imports`). `test/`가 `src/`보다 한 겹 위라 **소스와 산출물 양쪽에서
  맞는 상대 경로가 없기 때문이다.**

**`shared/`는 ESM 한 벌이고 메인·테스트는 그것을 `require`한다.** Node 22.12부터 되는 일이고
(테스트 러너 22.20 · Electron 43의 24.18 양쪽에서 확인), `out/shared/package.json`에
`{"type":"module"}` 한 줄을 빌드가 써서 그 디렉터리만 갈라준다. **`.mjs`로 이름을 바꾸는 길은
피했다** — 브라우저의 MIME 판정이 다음 문제가 된다.

**의존 방향은 한쪽이다**: `shared/core → dom → store → views → app.ts`. 아무도 `app.ts`를
import하지 않는다. 화면을 다시 그려야 하는 쪽(store의 `commit()`, memo의 선택 변경)은
`render-bus.ts`의 `notify()`를 부르고, `app.ts`가 `subscribe(render)`로 한 번만 받는다.
**뷰에서 `app.ts`를 import하면 이 구조가 깨진다** — 필요하면 `notify()`를 쓸 것.

**`src/shared/`는 Node도 DOM도 모른다. 이제 컴파일러가 지킨다** — 위 `tsconfig.shared.json`.
2026-08-22까지는 산문으로만 있는 규칙이었고, 지킬 사람이 셋(메인·렌더러·테스트)이었다.
모바일이 붙으면 넷이 된다.

**`core-bridge.js`와 `window.EM_CORE`는 없어졌다** (2026-08-22, #70). 한 파일을 고전
`<script>`와 `require` 두 방식으로 읽던 구조가 그것들을 필요하게 만들었는데, `require(esm)`이
가능해지면서 전제가 사라졌다. 옛 커밋이나 문서에서 그 이름을 보면 이 날짜를 기준으로 읽을 것.
**그때 함께 사라진 함정 하나**: 손으로 적은 재수출 목록에 이름을 빠뜨리면 `init()`이 죽고
**증상이 오류 화면이 아니라 `<body class="booting">`에 멈춘 앱**이었다. 지금은 import가
컴파일에서 죽는다. 그래도 **렌더러를 건드린 뒤에는 `booting`에 멈추지 않는지 한 번 띄워
볼 것** — 타입이 잡지 못하는 실패는 여전히 그 모습으로 나타난다.

**제어 문자는 이스케이프로만 쓴다.** `orderGroupOf()`의 구분자처럼 U+0000이 필요하면
`\u0000`이라고 쓸 것 — 파일에 0x00 바이트를 날것으로 넣으면 **ripgrep이 그 파일을 바이너리로
보고 검색을 통째로 거부한다.** 하필 가장 자주 읽는 파일이라 대가가 크다. git은 앞 8000바이트만
보고 판단해서 diff는 멀쩡해 보이니, 깨지기 전까지 아무도 모른다.

## 반드시 지켜야 할 것 (어기면 데이터가 날아감)

- **`QUADS`와 `PLACES`는 다르다.** `QUADS`는 네 개뿐이고 2×2 격자를 도는 루프
  (`renderMatrix`, `renderCounts`, `markEdge`)가 쓴다 — 여기에 `'inbox'`를 넣으면 없는 DOM을
  찾아 죽는다. `PLACES = [INBOX, ...QUADS]`는 **유효한 `quadrant` 값 집합**이고
  `normalizeTasks()`의 검사에만 쓴다. 새 위치를 추가한다면 이 구분을 그대로 지킬 것.
- **`space`는 "어느 매트릭스"이고 `quadrant`와 직교한다.** 업무/일상은 파일이 아니라 task의
  필드로 나뉘어 있고(`SPACES`), 값은 `spaceFor(quadrant, space)` **한 곳에서만** 정해진다 —
  `normalizeTasks()`와 `renderer/store.ts`의 `makeTask`/`moveTask`가 같은 함수를 부른다. 규칙은 하나뿐이다:
  **`quadrant === INBOX`면 `space`는 반드시 `null`.** 인박스가 두 매트릭스의 공유 영역인 것이
  이 null에서 나오고(`inSpace()`가 null을 양쪽 통과로 본다), 인박스에서 분면으로 끌어내리는
  드롭이 소속을 정하는 유일한 순간이다. 인박스 행에 `space`를 남기면 그 항목이 한쪽에서만
  보이고, 분면 항목의 `space`를 null로 두면 양쪽에 겹쳐 보인다.
- **"화면에 보이는 것만" 거르는 곳이 전부 `inSpace()`를 거쳐야 한다.** 4분면·히스토리·휴지통·
  헤더 개수·내보내기가 전부 활성 space 기준이다. 일괄 작업은 **탭이 이미 보여준 행 목록을
  그대로 받아서** 그 객체에 쓴다 — `tasks`를 조건으로 다시 거르면 화면에 없는 반대쪽 보드까지
  날아간다.
- **task는 절대 배열에서 지우지 않는다.** 상태는 네 개의 타임스탬프 필드로만 표현한다:
  - 활성: `purgedAt === null && completedAt === null && deletedAt === null`
  - 완료(히스토리): `completedAt !== null`
  - 휴지통: `deletedAt !== null`
  - 영구 삭제: `purgedAt !== null` — **묘비다.** 행은 파일에 남고 `text`·`memo`만 비운다.
    지우면 아직 동기화하지 않은 다른 기기가 그 항목을 도로 밀어 넣는다.
  - 실제 `filter`로 제거하는 곳은 `dropExpiredTombstones()` 단 하나뿐이고,
    `main/store.ts`의 `load()`가 시작할 때 한 번 부른다 (TTL 90일).
- **분면 안의 순서는 배열 위치가 아니라 `orderKey`다.** 문자열을 사전순으로 비교하고
  (`compareOrder`), 두 행 사이에 끼울 키는 `orderKeyBetween()`이 만든다 — 한 행만 쓰면 되므로
  이동이 전체 목록 쓰기가 되지 않는다. 키는 **`(quadrant, space)` 조합 안에서만** 유효하니
  다른 분면의 키와 비교하지 말 것. **배열을 재정렬하고 화면이 따라오길 기대하면 안 된다.**
  목록을 뽑는 곳은 전부 `compareOrder`로 정렬해야 한다(`activeOf`, `export.ts`의 `inList`).
- **task 스키마에 필드를 추가하면 기존 `data.json`에는 그 필드가 없다.** `shared/core.ts`의
  `normalizeTasks()`에서 기본값을 채워줘야 한다. 마이그레이션 코드 없이 필드를 읽으면 기존
  사용자 데이터에서 `undefined`가 된다. **값이 이상하면 화면에서 사라지는 필드**(`quadrant`
  처럼 렌더링 분기에 쓰이는 것)는 기본값만이 아니라 유효성까지 여기서 잡아준다.
- **저장은 temp write + rename** (`main/store-io.ts` `writeStore`). 이 패턴을 단순
  `writeFileSync`로 바꾸지 말 것 — 쓰다 끊기면 전체 할 일이 사라진다.
- IPC를 새로 추가할 때는 **세 곳을 모두** 건드려야 한다: `main/ipc.ts`의 `ipcMain.handle`,
  `preload.ts`의 `exposeInMainWorld`, 렌더러의 `window.api.*` 호출.
- **`preload.ts`는 샌드박스라 로컬 파일을 `require`할 수 없다.** `require`가 주는 것은
  Electron 내장 모듈 몇 개뿐이고, `require("./shared/...")`를 넣는 순간 **preload가 통째로
  죽는다.** 증상은 `window.api`가 **undefined** — 잘못된 import처럼 보이지 않고 앱이 망가진
  것처럼 보인다(2026-08-08 실측). 메인이 아는 값을 렌더러에 **첫 페인트 전에** 넘겨야 하면
  `webPreferences.additionalArguments`로 보내고 preload가 `process.argv`에서 읽는다 —
  언어(`--nekan-lang`)와 지원 목록(`--nekan-langs`)이 그 방식이다.
- **토큰은 IPC를 건너지 않는다.** `window.api`에 토큰을 돌려주는 함수가 **하나도 없어야** 한다.
  렌더러가 알 수 있는 것은 `state:load`의 `auth`(= `{ email, userId }`)뿐이고, 그 객체는
  `shared/auth.ts`의 `publicSession()`이 **필드를 골라서** 만든다 — 지우는 방식이 아니라
  고르는 방식인 이유가 있다. 세션에 필드를 추가해도 여기 이름을 적지 않는 한 새어나가지 않는다.
- **렌더러의 `Date.now()`를 직접 쓰지 않는다.** `renderer/store.ts`의 `now()`가
  `Date.now() + clockOffset`이고, 오프셋은 메인이 서버 응답의 `Date` 헤더로 재서 넘긴다.
  **`updatedAt`이 LWW의 기준이라, 시계가 10분 느린 기기는 그 기기의 모든 편집을 조용히 잃는다.**
  이 파일에 타임스탬프를 새로 쓸 일이 생기면 `now()`를 쓸 것 (`uid()`만 예외 — 비교용이 아니다).
- **`state:save`는 덮어쓰기가 아니라 병합이다** (`main/store.ts`의 `mergeRendererTasks`).
  렌더러가 마지막으로 그린 뒤 pull이 끼어들 수 있고, 그때 통째로 덮으면 방금 받은 행이 사라진다.
  병합이 안전한 이유는 **task를 배열에서 지우는 일이 없기 때문**이다 — 삭제가 타임스탬프라
  "정당하게 행이 빠진 저장"이란 것이 존재하지 않는다. 동점은 렌더러가 이긴다(화면에 있는 쪽).
- **sync는 로컬 task를 절대 지우지 않는다.** 로그아웃해도 `data.json`은 그대로다. 커서와
  푸시 워터마크(`settings.sync`)만 비운다 — 계정이 바뀌면 남의 커서 때문에 행을 통째로 건너뛴다.
- **커서는 진실이 아니라 최적화다.** `server_seq`는 트랜잭션 안에서 발급돼서, 먼저 커밋된 행이
  더 큰 번호를 가질 수 있다. 그 틈에 pull이 들어가면 행 하나를 영영 건너뛴다. 그래서
  `main/sync.ts`가 **시작할 때와 6시간마다 커서를 버리고 전체를 다시 읽는다**(`RECONCILE_MS`).
  병합이 LWW라 여러 번 읽어도 값이 달라지지 않으니 대가는 요청 몇 번뿐이다. **이걸 없애면
  아주 가끔 할 일 하나가 조용히 사라진다** — 재현이 거의 불가능한 종류의 버그다.
- **refresh_token은 갱신할 때마다 회전한다.** 그래서 두 규칙을 깨면 안 된다:
  ① 새 쌍을 **쓰기 전에 먼저 디스크에 저장**한다(`remember()`가 그 순서다). 저장 전에 죽으면
  로그아웃된다. ② **동시에 두 번 갱신하지 않는다** — `refreshSession()`이 진행 중인 promise
  하나를 공유하는 이유다. 나란히 도는 요청 둘이 각자 갱신하면 하나가 다른 하나를 무효화한다.
  갱신이 4xx로 실패하면 그 토큰은 영영 죽은 것이라 세션을 버리고, **4xx가 아니면(네트워크)
  세션을 유지한다** — 터널을 지났다고 로그아웃되면 안 된다.
  ③ **진행 중인 갱신은 자기가 시작한 세션이 아직 그대로인지 확인하고 행동한다**
  (`runRefresh()`의 `stillOurs()`). 그 사이에 로그아웃했다 다시 로그인하면 **다른** 세션이
  들어와 있고, 그때 성공 경로는 새 세션을 옛 토큰으로 덮고 4xx 경로는 멀쩡한 새 세션을 지운다.
- **로그아웃은 `?scope=local`이어야 한다.** `/auth/v1/logout`의 기본값은 `global`이라 계정의
  **모든 기기** 세션을 끊는다 — 실측으로 확인했다(기본값: 다른 기기 세션 죽음, `scope=local`:
  살아있음). 여러 기기에서 쓰는 것이 이 앱의 목적이라 노트북에서 로그아웃했다고 폰까지
  로그아웃되면 안 된다.

## 알아두면 좋은 것

- **비밀번호 로그인은 패키징된 빌드에 존재하지 않는다.** `main/ipc.ts`가 `auth:login`을
  `!app.isPackaged`일 때만 등록한다. 사용자에게 열린 길은 Google 하나뿐이고, 비밀번호는
  **사람이 동의 화면을 누르지 않고도 동기화를 검증하기 위한** 개발용 통로다. 가이드의 개발용
  폼도 `state:load`의 `devLogin`을 보고 그때만 나온다. 이 통로를 없애면 **동기화를 자동으로
  검증할 방법이 사라진다** — 없애기 전에 대체 수단을 먼저 만들 것.
- **Google 로그인은 시스템 브라우저로 나갔다가 loopback으로 돌아온다** (`main/oauth.ts`).
  포트는 `listen(0)`으로 OS가 고른다 — 그래서 Supabase의 Redirect URL 허용목록에
  `http://127.0.0.1:*`가 있어야 한다. 와일드카드를 못 쓰게 되면 고쳐야 할 곳은 그 `listen(0)`
  한 줄이다. 앱 안 webview를 쓰면 **Google이 막는다.**
- **콜백 서버는 `/callback`이 아닌 요청을 404로 흘려보낸다.** 브라우저가 보내는 favicon 요청
  하나에 로그인이 끝나버리면 안 되기 때문이다.
- **브라우저 마지막 화면에 "로그인되었습니다"라고 쓰지 말 것.** 그 시점에 일어난 일은 코드가
  돌아온 것뿐이고, 교환은 그 다음에 실패할 수 있다. 판정은 앱이 한다.

- `app.setName('Nekan')`이 `main.ts` 최상단에 있는 이유: `npm start`와 패키징된
  exe가 **같은** `%APPDATA%\Nekan\data.json`을 보게 하려고. 지우면 개발용/배포용
  데이터가 갈라진다. **이름이 바뀔 때마다 이 폴더도 바뀐다** — 그래서
  `main/store.ts`의 `legacyStorePaths()`가 옛 폴더를 **최신순 배열**로 넘기고
  (`Nekan` ← `EisenhowerMatrix` ← `eisenhower-matrix`), `migrateLegacyStore()`가
  존재하는 첫 파일 하나만 복사한다. **대상 파일이 이미 있으면 절대 덮지 않는다** —
  덮으면 실행할 때마다 살아 있는 데이터가 옛 사본으로 되돌아간다.
  또 이름을 바꾼다면: 새 이름을 `setName()`에 넣고, **직전 이름을 배열 맨 앞에** 넣는다
  (배열은 최신순이고, 존재하는 첫 항목이 이긴다).
- **창 크기는 expanded 모드의 것만 저장한다** (`main/window.ts`의 `rememberPlacement`). 바 크기가
  저장돼버리면 다음 실행 때 640×48로 열린다. 바는 **위치만** `settings.barPosition`에 따로 남는다.
- **`ready-to-show`는 렌더러의 `state:load`가 끝난 뒤에 온다.** 그래서 시작할 때의 접기
  (`settings.mode === "collapsed"`)를 렌더러가 볼 방법이 없다 — `state.mode`를 읽는 시점에는
  아직 `expanded`이고, 바는 그 뒤에 `win:mode` 푸시로 온다. **시작 모드에 조건을 걸 곳은
  `main/window.ts`의 `ready-to-show` 한 곳뿐이다.** 첫 실행 선택 화면이 실제로 그랬다:
  렌더러에서 `window.api.expand()`를 부르는 조건이 **한 번도 참이 되지 않아**, 바 모드로
  종료했던 사용자가 업데이트 후 380px 카드를 **640×48 바 안에서** 만났다. 판정은
  `shared/core.ts`의 `needsStartupChoice()`에 있고 메인·렌더러가 같은 함수를 부른다.
- **`win.setResizable(true)`는 Windows에서 최소 크기를 되돌린다.** 접을 때 저장돼 있던 값이 펼
  때 복원되므로 `expand()`의 `setMinimumSize`는 `setResizable` **뒤에** 와야 한다. 지금은 최소
  높이가 늘 `EXPANDED.minHeight`라 증상이 없지만, 무엇이든 그 값을 바꾸는 날 바에서 돌아온
  창이 옛 최소 크기에 묶인다 — 2026-08-21에 메모 패널이 잠깐 그랬고 실측 820px이었다.
- **모드 전환의 기준점은 창에 물어보지 않고 저장된 값을 쓴다.** `expand()`는 `barPosition`에서,
  `collapse()`는 `bounds`에서 출발한다. `win.getBounds()`로 재면 배율이 걸린 화면에서 요청값과
  1~2px 어긋난 값이 돌아오고, 그걸로 다음 전환의 기준을 잡으면 **토글할 때마다 위젯이 몇 px씩
  화면을 걸어간다**(실측으로 왕복당 +4px). 같은 이유로 `switching` 플래그가 켜져 있는 동안에는
  `rememberPlacement`가 아무것도 저장하지 않는다 — 전환·창 생성이 일으킨 resize/move는
  사용자가 옮긴 것이 아니다.
- 어느 모서리를 기준으로 펼치고 접을지는 `shared/core.ts`의 `expandOrigin()`·`collapseOrigin()`
  **두 순수 함수에만** 있다. 화면 오른쪽에 붙은 바는 오른쪽 끝을 맞춰 왼쪽으로 자라고, 오른쪽
  절반에 있는 창은 오른쪽 끝으로 접힌다. 이 둘이 짝이라 왕복해도 제자리다 — 한쪽만 고치면
  **오래 그렇지 않았다.** 접기는 "창의 중심이 화면 중앙보다 오른쪽인가"로 정하는데 펴기는
  "오른쪽으로 자랄 자리가 있는가"로 정했다. 두 질문이 달라서 **가운데쯤 있는 창이 한 번에
  최대 318px 옮겨갔다** (2026-08-19, 2304px 화면에서 시작 위치 1303곳 중 333곳). 지금은 펴기도
  같은 질문을 하고, `test/core.test.ts`가 **모든 시작 위치를 훑어** 0px임을 지킨다 — 모서리
  두 곳만 보는 spot check는 이 결함을 통과시켰다. **그 훑는 테스트를 지우면 조용히 돌아온다.**
  **위 2304·1303·333은 실측 화면의 숫자이고 테스트의 숫자가 아니다.** 테스트는 자기 픽스처
  (화면 1920 · 바 600 · 창 1000, 시작 위치 921곳)를 쓴다 — 두 함수가 bar·win·screen을 인자로
  받는 순수 함수라 폭이 무엇이든 왕복 성질은 같고, 그래서 `BAR.width`가 684가 돼도 픽스처는
  따라가지 않는다. **픽스처의 600을 앱의 값이라고 읽지 말 것.**
  토글할 때마다 위젯이 이동한다.
- 분면 비율 `layout.cols/rows`는 0.15~0.85로 클램프된다. 상수와 클램프 함수는
  `shared/core.ts` 한 곳에만 있고 `main/ipc.ts`와 `renderer/window/layout.ts`가 그걸 부른다.
  드래그용 픽셀 클램프(`clampAxis`)와 `MIN_COL_PX`/`MIN_ROW_PX`도 **거기 있어야 한다.**
  이유가 둘이다: `clampAxis`의 상한을 `1 - MIN_RATIO`로 직접 쓰면 `MAX_RATIO`를 바꿔도
  드래그에 반영되지 않고, `MIN_COL_PX`는 드래그 클램프와 `applyLayout()`의 `minmax()`
  바닥값 **두 곳이 같은 값이어야** 한다.
- **`win.getBounds()`를 `setBounds()`에 되먹이면 배율이 걸린 화면에서 창이 자란다.** 왕복이
  멱등이 아니라서, 읽은 값을 그대로 다시 쓰면 125%에서 **여닫을 때마다 가로 +4px**씩 늘고
  그 값이 `bounds`로 저장돼 재시작해도 남는다. 메모 패널이 실제로 그랬다 — 요청 높이를 0으로
  줘도 자랐으니 높이 계산이 아니라 왕복 자체가 원인이다(2026-08-08 실측: 10회에
  1004×706 → 1044×719). 그래서 `setMemoPanel()`도 모드 전환과 같은 규칙을 따른다:
  **저장된 `bounds`에서 출발하고, 저장할 값은 요청한 값이지 창이 돌려준 값이 아니다.**
  **`--force-device-scale-factor=1`에서는 증상이 완전히 사라진다** — 100% 화면에서만 확인하면
  고쳐진 것처럼 보이니 반드시 배율이 걸린 화면에서 볼 것.
  창 생성만은 여전히 요청보다 크게 잡혀서, 냉시작 뒤 처음 창을 옮길 때 `bounds`가 한 번
  +5px 커진다. **누적되지는 않는다**(재시작·이동 3회 반복 실측: 1005×705에서 고정).
- **메모 패널과 다 꺼내기는 같은 방식이다 — 둘 다 매트릭스에서 높이를 가져간다.**
  창 크기는 변하지 않고, `main/window.ts`는 **두 패널의 존재를 모른다.** 높이는 CSS
  `--memo-h`·`--inbox-h`가 정하고, 위/아래 경계를 끌면 `renderer/window/layout.ts`의
  `applyLayout()`이 그 변수를 `settings.layout.memo`·`.inbox`(px)로 덮어쓴다. 기본값을 바꿀
  곳은 `styles/base.css` 한 곳이고, `null`이 "스타일시트가 정한 값"이다.
  **2026-08-21 전에는 메모 패널만 창을 키웠다**(`memoDelta`·`boundsWithoutMemo`·`win:memo`).
  전부 사라졌으니 옛 커밋이나 문서에서 그 이름을 보면 이 날짜를 기준으로 읽을 것 —
  근거는 `docs/DECISIONS.md` 2026-08-21이고, 2026-08-01 항목이 그 앞에 살아 있다.
  **그래서 다 꺼내기가 걸렸던 함정 셋에 메모 패널도 함께 걸린다**(아래 항목 ①②③).
  `.memo`는 `flex: 0 1 var(--memo-h)` · `min-height: 0` · **자신이 flex 컬럼**이어야 하고,
  `.memo-card`는 `height: 100%`가 아니라 `flex: 1 1 auto`여야 한다 — 아니면 카드가 4분면 위로
  넘치고, `body`의 `overflow: hidden` 때문에 **겉보기엔 고쳐진 것처럼 보인다.**
  **드래그 방향이 다 꺼내기와 반대다**: 메모 패널은 경계 아래에 있어서 **위로 끌면 커진다.**
  범위는 `MIN_MEMO_PX`(96)부터 `memoRoom()`이 계산한 여유까지 — `inboxRoom()`의 쌍둥이이고,
  같은 이유로 **pointerdown 때 한 번만** 잰다(드래그 중에 재면 답이 자기 자신에게 되먹인다).
- **인박스("다 꺼내기")도 매트릭스에서 높이를 가져간다.** `main/window.ts`에 창 크기 회계가
  없고 접힘 상태(`settings.inboxOpen`)만 저장한다. 대신 목록이 4분면을 밀어내지 않도록 `styles/base.css`의 `--inbox-max-h`와 `styles/inbox.css`의 `26vh`가
  높이를 묶는다 — 이 상한을 없애면 항목이 쌓일수록 매트릭스가 화면 밖으로 나간다.
  **그 상한만으로는 부족하다.** 26vh는 *창*의 몫이지 *남은 공간*의 몫이 아니라서, 창을 최소
  크기(760×520)로 줄이면 매트릭스가 자기 그리드 바닥값 아래로 밀려 아래 두 분면이 화면 밖으로
  나갔다(실측 35px, q3·q4 입력칸이 잘림). 세 가지가 함께 있어야 성립한다:
  ① `.view.matrix`는 `flex-basis: 0` — `auto`면 그리드 내용이 base size라 **기본 크기에서도**
  컬럼이 초과 상태이고, 그걸 매트릭스가 혼자 흡수하고 있었다. ② `section.inbox`는 `flex-shrink: 1`
  에 `min-height: 0`이고 **자신이 flex 컬럼**이어야 한다 — `display: block`이면 박스만 줄고
  자식은 그대로 넘쳐 매트릭스 위에 겹친다(`body`의 `overflow: hidden` 때문에 **겉보기엔 고쳐진
  것처럼 보인다**). ③ `applyLayout()`이 `min-height`로 `2 * MIN_ROW_PX + GUTTER + 세로 패딩`을
  선언한다 — **패딩을 빼먹으면 border-box라 20px이 모자라** 여전히 넘친다.
  검증은 760×520(최소)과 1000×700(기본) **둘 다** 볼 것. 기본에서 인박스 목록 높이가 170px이
  아니면 회귀다.
- **`main/window.ts`의 `BAR.width`는 타이틀바 내용이 정한다.** 원래 440px이었는데 업무/일상 토글이
  들어가면서 한 줄이 484px을 요구해 창 버튼이 오른쪽 밖으로 밀려났고, 업데이트 버튼이 들어가며
  600 → 640px이 됐고, 2026-08-15에 **660px**이 됐다 — 이번 것만은 자리가 모자라서가 아니라
  마지막 버튼에서 6px 만에 끝나 꽉 차 보여서다. **용량이 아니라 여백이다.**
  바에서 빠지는 건 `.title` 텍스트와 그 옆 버전 표시뿐이다(아이콘·토글·칩·
  톱니바퀴·업데이트 버튼·창 버튼은 전부 남는다). **바에 뭔가를 더 넣으면 줄이지 말고 `BAR.width`를 키우고,
  반드시 실측**할 것: 개수를 전부 두 자리로 바꾸고 인박스 칩과 `#updateBtn`을 보이게 한 뒤
  `.titlebar`의 `scrollWidth`와 `#closeBtn`의 `right`를 `window.innerWidth`와 비교한다
  (현재 최악의 경우 여유 **30px**). `.bar-summary`가 `margin-left:auto`라 `scrollWidth`만 보면
  넘쳐도 딱 맞아 보이니, 스위치 오른쪽 끝과 `.bar-summary` 왼쪽 끝 사이 간격도 같이 볼 것 —
  **그 간격이 곧 여유다.** 오래 28px이었는데, 스위치가 알약 하나를 미끄러뜨리게 되면서
  두 버튼 사이 `gap: 2px`가 없어져 **30px이 됐다**(2026-08-07 실측: `scrollWidth` 640 =
  `innerWidth` 640, 넘침 0).
  **그 30px은 개수가 두 자리일 때의 값이다.** 세 자리가 되면 **8px**로 떨어지고, 네 자리면
  `scrollWidth` 669로 **29px 넘친다**(2026-08-08 실측). 분면 하나에 1000개는 비현실적이지만,
  바에 뭔가를 더 넣을 때 기준으로 삼을 값은 30이 아니라 **세 자리 기준 8px**이다.
  **여유는 언어에 따라 달라진다** — 스위치가 `업무/일상`에서 `Work/Life`가 되면서 두 자리
  기준 30 → **27px**이 됐다(세 자리는 양쪽 다 8px, 넘침 0. 2026-08-09 실측). 세 번째 언어를
  넣을 때는 이 두 낱말이 제일 긴 언어로 다시 재야 한다.
  **개수를 CDP로 바꿔 잴 때는 접은 _다음에_ 바꿀 것** — `collapse()`가 `notify()`를 부르고
  `renderCounts()`가 진짜 개수로 되돌려서, 먼저 바꾸면 여유가 100px처럼 보인다.
  **`#updateBtn`은 아이콘이다. `textContent`를 넣어서 재지 말 것** — 그 버튼 안에는 SVG가 있고
  `labelBtn()`은 `title`·`aria-label`만 바꾼다. 재려고 글자를 넣으면 아이콘이 사라지고 그 글자가
  30px 버튼 안에서 두 줄로 접혀 48px 바 밖으로 잘린다. **그 화면을 버그로 착각한 적이 있다**
  (2026-08-15). 보이게 하려면 `hidden` 클래스만 떼면 된다. 개수는 `--quad 320` 같은 씨앗 데이터로
  진짜 세 자리를 만드는 편이 더 안전하다.
  **가로 넘침만 보면 이런 종류를 놓친다.** 바의 자식은 눌리면서 글자를 접기 때문에
  `scrollWidth > clientWidth`는 계속 거짓이다 — 세로로 터지는 것은 **찍어서 봐야** 보인다.
  **⚠️ 세 자리에서는 그 간격이 여유를 나타내지 않는다.** 8px은 최솟값이라 거기서 바닥을 친다 —
  2026-08-12에 간격 토큰화로 요약 영역이 300 → 285px이 됐는데 **간격은 양쪽 다 8px로 똑같았다.**
  그것만 봤으면 "변화 없음"으로 잘못 읽었을 값이다. **진짜 여유는 뷰포트를 줄여 넘침이 시작하는
  폭으로 잰다**: CDP `Emulation.setDeviceMetricsOverride`로 폭을 1px씩 낮춰가며 매 폭마다
  `.titlebar`의 **`scrollWidth > clientWidth`가 참이 되는 첫 폭**을 찾는다. 그 폭 + 1이 들어가는
  최소 폭이고, `BAR.width`에서 그걸 빼면 여유다. **한 폭에서 잰 `scrollWidth - innerWidth`로 역산하지 말
  것** — 바의 자식들이 `flex: 0 1 auto`라 좁아지면 눌리므로, 그 뺄셈은 답처럼 보이는 다른 값이다
  (실제로 역산과 스캔이 1px 어긋났다). `innerWidth`가 아니라 `.titlebar`의 `clientWidth`와
  비교하는 이유도 같다: 바가 뷰포트 폭과 같다는 보장이 없다.
  2026-08-15 스캔값 — 처음 넘치는 폭 **631 → 616px**, 즉 들어가는 최소 폭 **632 → 617px**.
  세 자리 기준 여유는 간격 토큰화로 **8 → 23px**이 됐고, 같은 날 `BAR.width`가 660이 되면서
  **43px**이 됐다. 내용 폭은 바 폭과 무관하므로 617은 바를 넓혀도 그대로다.
  **그 617은 맑은 고딕 기준이다.** 2026-08-18에 Pretendard로 바뀌면서 들어가는 최소 폭이
  **625px**이 됐고, 세 자리 기준 여유는 43 → **35px**이다. 같은 글자 크기라도 글꼴이 바뀌면
  폭이 바뀌니, **`--font`를 건드린 날에는 이 숫자부터 다시 잰다.**
  **2026-08-19에 `BAR.width`가 684가 됐다.** 칩의 `gap`이 4 → 6px이 되면서 들어가는 최소 폭이
  633 → **657px**(영어)로 뛰어 660 기준 여유가 **3px**만 남았다. 줄이는 대신 바를 넓혀 갚았고,
  지금 여유는 한국어 **41px** · 영어 **27px**(들어가는 최소 폭 643 / 657)이다. **영어가 늘 최악이다.**
  칩 하나의 `gap` 2px이 24px을 먹는다 — 칩이 다섯이고 그 뒤가 눌리기 때문이다.
  이 override 방식을 쓰는 이유가 하나 더 있다: **가려진 Electron 창은 리레이아웃을 하지 않아서**
  진짜로 `collapse()`를 해도 `window.innerWidth`가 확장 모드 값을 계속 돌려준다
  (`document.hidden`이 참인지 먼저 볼 것). 창을 안 띄우고도 같은 엔진에 같은 질문을 할 수 있다.
  스크린샷은 `PrintWindow`가 오른쪽 영역을 갱신 안 된 채 찍는 일이 있으니 CDP
  `Page.captureScreenshot`을 쓸 것. **다만 화면에 없는 창에서는 프레임이 영영 안 와서 멈춘다** —
  `Page.bringToFront`를 먼저 보내고 타임아웃을 걸 것. 그리고 **CSS를 바꿔가며 비교할 때는
  `location.reload()` 뒤에 표식을 확인할 것**(`--sp-md` 같은 새 토큰이 잡히는지). 리로드를
  빠뜨린 채 찍은 "before"와 "after"가 같은 화면이었던 적이 있다.
  **테마·내보내기가 설정 패널로 들어가면서 바 버튼이 하나 줄고 톱니바퀴가 하나 늘어 순증은
  0이다** — 그때까지 실측 여유는 28px이었다(2026-08-07). 동기화 상태는 56px 칩 대신 톱니바퀴의 점이라
  **폭을 쓰지 않고 바에서도 보인다.**
  **바에서 빠지는 것은 `collapsed.css`가 이름으로 적은 것뿐이다.** `.brand` 안에 넣었다고
  따라 빠지지 않는다 — 동기화 칩이 그래서 바에 남아 있었고(실측 56px, 여유는 28px),
  `collapsed.css`에 한 줄 더 적어서야 빠졌다. **클래스만 보지 말고 실제로 안 보이는지 볼 것.**
  **빠지는 자리(`.title`·`.app-version`)에 넣으면 폭이 안 든다** — `#exportBtn`은 설정
  패널로 옮겨가면서 **DOM에서 아예 사라졌으니** 그 자리를 세지 말 것(2026-08-07 확인). 버전
  표시가 그렇게 들어갔고 그때도 실측 여유는 그대로였다. 늘 보일 필요가 없는 것은 이쪽을 먼저 볼 것.
- **views/settings.ts`는 window/chrome.ts`를 import하지만 그 반대는 안 된다.** 테마 세그먼트
  컨트롤을 반영하는 코드가 `applyTheme()` 안에 있는 이유다 — settings에 두면 순환이 된다.
  렌더러 그래프에 순환은 여기 말고 한 군데도 없다.
- **`.switch`(`styles/switch.css`)는 업무/일상과 테마가 함께 쓴다.** 미끄러지는 알약은 컨테이너의
  `::before` 하나이고, 어느 쪽에 설지는 CSS `:has(> .switch-btn:last-child.active)`가 정한다 —
  **위치를 JS가 따로 알려주지 않으므로** 버튼에 `.active`를 붙이는 코드만 고치면 된다.
  세 가지가 서로 묶여 있다:
  ① **두 버튼 사이에 `gap`을 넣으면 알약이 어긋난다.** 폭이 `calc(50% - 2px)`이고 이동이
  `translateX(100%)`라, 간격이 0이어야 두 번째 버튼 자리에 정확히 떨어진다.
  ② **버튼에 `position: relative; z-index: 1`이 없으면 라벨이 알약에 덮인다** — 알약은 절대
  배치라 배치되지 않은 형제보다 늦게 그려진다.
  ③ **`<body class="booting">`은 `app.ts`의 `releaseSwitches()`가 뗀다.** 저장된 보드·테마는
  IPC 왕복 뒤에 적용돼서, 이게 없으면 켤 때마다 알약이 왼쪽에서 미끄러져 들어온다. 떼기 전에
  `offsetHeight`를 한 번 읽는 것이 핵심이다 — `requestAnimationFrame`은 콜백이 그 프레임의
  스타일 계산 **앞**에서 돌아 변화와 해제가 같이 묶일 수 있다.
- **`.primary`는 `memo.css`가 이미 쓰고 있다.** 새 버튼에 그 이름을 붙이면 앱 강조색으로
  칠해진다. 첫 실행 화면의 Google 버튼이 그렇게 칠해졌었다 — Google은 버튼 크롬을 중립으로
  두라고 요구하므로 `.recommended`로 갈랐다.
- 인박스 행에는 마감일·완료·메모가 **의도적으로 없다**(`inboxItemEl`). 그래서 `selectedTask()`가
  `quadrant === INBOX`를 null로 본다 — 이걸 빼면 선택된 항목을 인박스로 끌어올렸을 때 메모
  패널이 열린 채 남는다.
- **내보내기(`export:run`)는 렌더러가 아니라 main의 `store.tasks`에서 만든다.** 렌더러의 모든
  변경이 `save()`를 거치므로 main의 배열이 곧 화면이고, IPC로 목록을 되돌려 받을 이유가 없다.
  대신 `loadStore()`는 정규화를 하지 않으므로 `buildSnapshot()`이 `normalizeTasks()`를 먼저
  돌린다 — 이걸 빼면 아직 렌더러가 한 번도 저장하지 않은 상태에서 내보낼 때 옛날 `data.json`의
  항목이 통째로 빠진다. PDF는 `shared/export.ts`의 HTML을 **숨은 BrowserWindow**에서
  `printToPDF`로 찍는다(앱 창을 재사용하면 매트릭스 위에 문서가 번쩍인다). 그래서 인쇄물
  모양을 바꿀 곳은 `shared/export.ts`의 `toHtml()` 하나뿐이고, `renderer/styles/`와는 무관하다.
  **그 하나가 문서 두 벌을 만든다.** PDF는 지우는 임시 파일이라 앱이 가진 글꼴을
  `file://`로 가리켜 글리프를 박을 수 있지만, 사용자가 저장하는 `.html`은 남의 컴퓨터로
  건너간다 — 이 기기의 설치 경로를 적으면 **거기선 죽은 링크이고 사용자의 홈 디렉터리가
  파일에 적혀 나간다.** 그래서 `@font-face`는 `toHtml(snapshot, { fontUrl })`로 **PDF 경로만**
  넘기고, 저장본은 패밀리 이름만 부른다. 새 외부 리소스를 넣을 때 같은 질문을 먼저 할 것:
  **이 문서는 지워지나, 남나.** (`file://` 글꼴은 **asar 안에서도 열린다** — 2026-08-18에
  대조군까지 두고 실측했다. `printToPDF` 창이 임시 폴더에서 페이지를 읽는데도 된다.)
- **자동 업데이트는 `app.isPackaged`가 아니면 아예 시작하지 않는다.** `npm start`에는 읽을
  `app-update.yml`이 없어서 매번 실패할 뿐이고, 개발 중인 앱이 릴리스본으로 자기를 갈아치우는
  것도 원하는 일이 아니다. **그래서 `npm start`로는 업데이트 경로를 한 줄도 검증할 수 없다** —
  아래 "검증"의 로컬 피드 절차를 쓸 것.
  화면에 나오는 상태는 `ready` **하나뿐이다.** 확인·다운로드 중에 버튼을 띄우면 눌러도 아무
  일이 없는 죽은 버튼이 되고, 어차피 `autoInstallOnAppQuit`이라 닫으면 적용된다 — 버튼은
  "지금 당길래?"라는 선택지일 뿐이다. 상태를 늘리고 싶으면 그 상태에서 **사용자가 할 수 있는
  일이 있는지** 먼저 물을 것.
  `updater.ts`는 `BrowserWindow`를 모른다. 알림은 `main.ts`가 넘긴 콜백 한 개로만 나가고,
  그 콜백이 `getWindow()`를 부른다. 여기서 window를 직접 import하면 조립이 `main.ts` 밖으로
  샌다. **포커스로 확인을 거는 것도 `app.on("browser-window-focus")`라 이 규칙을 안 깬다** —
  창을 건네받지 않아도 되는 유일한 형태다.
- **확인 시점은 셋이고 전부 `checkIfDue()`를 지난다** (첫 확인만 `check()` 직행):
  포커스 획득 · `powerMonitor`의 `resume` · 6시간 타이머.
  **그 타이머는 `setInterval`이 아니라 `check()`가 매번 다시 거는 일회성 `setTimeout`이다.**
  `setInterval`은 만들어진 시각 기준 고정 스케줄이라, 포커스 확인이 발화 직전 30분 안에
  들어오면 그 슬롯이 스로틀에 막혀 통째로 버려지고 다음은 6시간 뒤다 — **간격을 줄이려던
  변경이 최악의 간격을 6시간 30분으로 늘린다.** 지금은 물어본 순간 타이머를 다시 걸어서
  6시간이 정확한 상한이다(실측: 강제 포커스로 예정 슬롯 하나가 사라지고 다음 확인이
  마지막 요청 기준으로 다시 잡혔다). **`CHECK_EVERY_MS`를 `setInterval`로 되돌리지 말 것.** **`MIN_GAP_MS`(30분) 스로틀이
  없으면 안 된다** — 최소화했다 복원하면 `browser-window-focus`가 **30ms 안에 두 번** 온다
  (2026-08-08 실측). 스로틀 기준은 `status.checkedAt`이 아니라 **마지막으로 물어본 시각
  (`askedAt`)**이다. 전자는 답이 와야 움직여서, 연속 실패 중에는 매번 다시 묻게 된다.
  `initUpdater()`가 `askedAt`을 **지금으로 초기화하는 이유**도 같은 실측이다: 창을 처음
  띄우는 것 자체가 포커스 이벤트라, 초기화가 없으면 시작 0.7초 만에 확인이 나가
  `FIRST_CHECK_MS`(10초)가 무의미해진다.
  `powerMonitor`는 **app ready 전에는 쓸 수 없어서** 파일 최상단이 아니라 `initUpdater()`
  안에서 `require`한다. `main.ts`는 이 파일을 `whenReady()`보다 훨씬 먼저 부른다.
- **`npm run release`에는 `GH_TOKEN`이 필요하다.** 없으면 빌드는 끝나고 업로드에서만 죽는다
  (`GitHub Personal Access Token is not set`). `gh`가 로그인돼 있으면 따로 만들 것 없이
  `GH_TOKEN="$(gh auth token)" npm run release`로 넘기면 된다. **토큰을 로그나 파일에 찍지 말 것.**
- **electron-builder가 만드는 것은 draft다.** 업로드가 끝나도 공개되지 않는다 —
  `gh release edit v<버전> --notes-file <파일> --draft=false --latest`로 노트를 넣고 공개한다.
  릴리스 노트는 **사용자가 주는 문구를 그대로** 쓴다.
- **electron-builder는 같은 태그로 draft를 두 개 만든다.** 업로드가 병렬로 돌면서 둘 다
  "릴리스가 없네"라고 판단해 각자 만드는 경쟁 상태이고, **v1.0.0부터 v1.0.4까지 다섯 번 다** 같은 식으로
  (`.blockmap`만 따로) 갈렸다 — 우연이 아니니 다음에도 갈라진다고 보면 된다. 그래서
  `npm run release`가 끝에 `tools/check-release.js`를 돌려 자동으로 합치고 파일 세 개를
  확인한다. **손으로 확인하지 말고 그 스크립트의 종료 코드를 볼 것.** 갈린 채로 publish하면
  조용히 망가진다: `latest.yml`이 없는 쪽이면 아무도 업데이트되지 않고, `.blockmap`이 없는
  쪽이면 모두가 매번 전체를 받는다.
- **`electron-builder`를 두 개 동시에 돌리지 않는다.** `npm run dist`·`npm run release`가 같은
  `dist/`를 지우고 다시 만들기 때문에, 나란히 돌면 Windows에서 `win-unpacked`가 잠겨 `EBUSY`로
  죽는다. 워크트리를 갈라도 `dist/`는 저장소마다 하나뿐이니 소용없다.
- **`package.json`의 `files`에 `node_modules`가 없어도 런타임 의존성은 asar에 들어간다.**
  electron-builder가 production dependency를 따로 수집하기 때문이다(확인: asar 헤더에
  `node_modules/electron-updater`가 있다). 그러니 `files`에 `node_modules/**/*`를 넣지 말 것 —
  넣으면 electron-builder가 하던 정리(README·테스트 제외)를 스스로 해야 한다.
- 항목 **클릭은 메모, 더블클릭은 텍스트 수정**이라 클릭 핸들러가 `CLICK_DELAY`만큼 기다렸다
  동작한다. 이 지연을 없애면 더블클릭이 선택을 두 번 토글해서 창이 커졌다 작아진다.
- 그리드 간격(`GUTTER`)은 CSS `--gutter`를 `getComputedStyle`로 읽어온다. 값을 바꿀 곳은
  `styles/base.css` 하나뿐이다.
- **마감일 표시는 "오늘" 기준이라 시간이 지나면 틀려진다.** `renderer/app.ts`의
  `scheduleDayRollover()`가 자정에 재렌더하고, 포커스 복귀·visibilitychange에서도
  날짜가 바뀌었으면 다시 그린다 (절전에서 깨어난 경우 대비).
- 메인이 보내는 `win:mode` 푸시는 렌더러의 `onMode` 등록보다 먼저 도착할 수 있다. 그래서
  등록은 `init()`의 **첫 await 이전**에 하고, `state:load`가 준 `mode`보다 푸시된 값을
  우선한다. 이 순서를 바꾸면 "창은 바 모드인데 내용은 확장 레이아웃"이 가끔 재현된다.
- 단일 인스턴스 락이 걸려 있어서, **앱이 이미 떠 있으면 `npm start`가 조용히 죽는다.**
  실행이 안 되는 것처럼 보이면 먼저 기존 프로세스를 확인할 것.

## 작업 규칙

- 코드 주석/커밋 메시지는 영어, 사용자 대화와 문서는 한국어.
  **다만 주석이 화면에 나가는 낱말을 인용할 때는 한글 그대로 둔다** — `"동기화 중"`,
  `"다 꺼내기"`, 업무/일상처럼. 규칙은 주석의 **문장**에 관한 것이고, 인용을 영어로 옮기면
  그 주석이 가리키는 카탈로그 값과 이어지지 않는다. 지금 스무 곳쯤이 그렇게 쓰고 있다.
  리뷰 도구는 이 둘을 구분하지 못하니 지적을 받으면 어느 쪽인지 먼저 볼 것.
- **렌더러 import 경로에는 `.js` 확장자를 반드시 쓴다.** 번들러가 없어서 브라우저 해석기가
  그대로 읽는다 — `from './store'`는 404로 죽는다.
- **조작 설명은 가이드 탭이 원본이고, README는 그 밖의 전부다.** 경계는 "앱을 쓰는 데 필요한가"
  하나다 — 필요하면 `guide.*` 카탈로그(두 언어)에 적고, 몰라도 되는 것(구현·근거·설치·개발)은
  README에 적는다. **가이드 탭만 보고도 앱을 다 쓸 수 있어야 한다**는 것이 합격 기준이다.
  기능을 바꾸면 그 두 곳 중 해당하는 쪽을 같이 고친다. 근거는 `docs/DECISIONS.md` 2026-08-10.
- 되돌리기 어려운 결정을 내렸으면 `docs/DECISIONS.md`에 한 줄 남긴다.
- **작업을 마칠 때마다 커밋한다.** 컨텍스트가 날아가도 커밋 로그가 남으면 복구된다.

## 다국어 (진행 중, #27)

- **문자열은 `src/shared/i18n/{ko,en}.json`에 있고 화면에는 `t("key")`로만 나간다.**
  용어 대응은 `src/shared/i18n/GLOSSARY.md`에 있다 — **새 문자열을 넣기 전에 거기부터 본다.**
  같은 한국어가 파일마다 다른 영어로 나가는 것을 막는 유일한 장치다.
- **진행률은 기억이 아니라 `node tools/find-untranslated.js`의 숫자다.** 파일별로 남은 한글
  줄 수를 센다(주석 제외). **`.js`·`.ts`·`.html`·`.css` 넷을 본다** — CSS를 빼먹었던 동안 도구는
  0을 말하면서 화면에는 한글 배지가 떠 있었다(위 ④). `index.html` 한글의 절반이 `title`·`aria-label`이라 **눈으로는
  끝났는지 알 수 없다** — 다 된 것처럼 보이는데 스크린 리더는 한국어를 읽는다.
- **i18next는 `node_modules`에서 직접 import한다** (`../../node_modules/i18next/dist/esm/i18next.js`).
  JSON 카탈로그도 `with { type: "json" }`으로 직접 import한다. **둘 다 패키징된 asar에서
  확인했다** — `npm start`는 `node_modules`가 그 자리에 있어서 아무것도 증명하지 못한다.
- **언어는 첫 페인트 전에 정해져 있어야 한다.** `state:load`는 IPC 왕복이라 늦는다(저장된
  테마가 늦게 와서 스위치 알약이 미끄러지던 것과 같은 함정). 메인이 창을 만들기 전에 정하고
  `additionalArguments`로 넘긴다. 위 preload 항목 참고.
- **전환은 재시작 없이 된다. 다만 "한 번 만들고 두는 것"은 전부 옛 언어로 남는다.** 재렌더가
  버리고 다시 만드는 것만 저절로 따라온다. 지금까지 걸린 셋은 성격이 다 다르다:
  ① **메인의 푸시로만 쓰이는 값** — 동기화 문구·톱니바퀴 툴팁, 그리고 핀·모드·업데이트 상태.
  뷰가 마지막 값을 들고 있다가 `renderAccount()`·`relabelChrome()`에서 다시 적용한다.
  ② **캐시로 렌더를 건너뛰는 곳** — `renderMatrix()`의 `rowsKey`는 task 필드만 보고 있어서
  언어가 바뀌어도 "달라진 게 없다"고 판단했다. 그래서 키 맨 앞이 `currentLanguage()`다.
  ③ **시작할 때 한 번 만들고 사는 DOM** — 4분면 add 폼의 마감 칩이 그렇다(행의 칩은 매번
  다시 만들어져서 멀쩡했다). `dueChip`의 고정 라벨을 생성이 아니라 `apply()` 안에 두고,
  `relabelAddForms()`가 네 개를 다시 칠한다. **그 호출은 `renderMatrix()`가 아니라 `render()`에
  있다** — 매트릭스는 자기 탭에서만 다시 그려서, 가이드 탭에서 언어를 바꾸면 네 개가 그대로
  남는다. 안 보이는 자리라 기억으로 때울 수 없고, 그래서 고쳤다.
  **첫 실행 카드가 같은 부류의 두 번째 사례다** — `welcome.adopt`는 카드가 열릴 때 한 번 쓰이고
  아무것도 다시 그리지 않아서, 태어날 때의 언어와 개수를 그대로 들고 있었다. `relabelWelcome()`을
  `render()`에서 부른다(카드가 안 떠 있으면 no-op).
  **새 문자열을 넣을 때 "이건 언제 다시 그려지지?"를 먼저 물을 것.**
  ④ **CSS `content:` 문자열** — 화면에 나가는 낱말인데 **어떤 카탈로그도 닿을 수 없다.**
  첫 실행 카드의 `추천` 배지, 빈 다 꺼내기 안내, 빈 분면의 `비어 있음` 셋이 그랬다.
  `:empty::after` 같은 CSS 전용 빈 상태를 유지하고 싶으면 `content: attr(data-empty)`로 두고
  마크업에 `data-i18n-attr="data-empty"`를 건다 — `applyStaticStrings()`의 속성 처리기는
  임의 속성 이름을 받는다. **스타일시트에 낱말을 적지 말 것.**
- **검수는 눈이 아니라 DOM 훑기로 한다.** 영어로 바꾼 뒤 `document.querySelectorAll('*')`를
  돌며 텍스트 노드와 **모든 속성값**에서 한글을 찾는다(task 텍스트와 언어 `<option>`은 제외).
  위 세 가지가 전부 이렇게 나왔다 — 화면만 보면 다 번역된 것처럼 보인다.
  **탭마다 돌리고, 언어를 바꾼 탭도 바꿔가며 돌릴 것.** 매트릭스 탭에서 바꾸면 통과하고
  가이드 탭에서 바꾸면 걸리는 것이 실제로 있었다(위 ③).
- **레이아웃 결함도 한 언어에서만 보인다. 번역 누락과는 다른 이야기다.** 스위치가 두 칸을
  `flex: 1 1 0`으로 나누고 있었는데, shrink-to-fit flex는 폭이 두 낱말의 **합**이라 절반은 늘
  평균이고 긴 쪽이 자기 글자보다 좁아진다. 알약은 `calc(50% - 2px)`로 정확히 절반이라 그대로
  어긋난다 — `Work`가 알약 중심에서 **3.7px** 벗어나 있었다. **`업무`·`일상`은 폭이 같아서
  이 결함이 영어로 읽기 전까지 숨어 있었다**(2026-08-18에 발견, 그리드 두 칸으로 고침).
  **정렬을 볼 때는 언어를 바꿔가며 볼 것** — 같은 폭의 낱말은 결함을 가린다.
- 언어 선택은 `.switch`가 아니라 `<select>`다. 알약이 `calc(50% - 2px)` + `translateX(100%)`라
  **정확히 두 칸일 때만 맞는다** — 세 번째 언어를 넣는 날 깨진다.
- **`dueInfo()`는 계산만 한다** — `{ date, days, state, otherYear }`. 문자열은
  `formatDue(info, t, locale)`가 만들고, **`t`를 인자로 받는다**: `shared/`는 카탈로그를 들 수
  없다 — i18next 초기화는 메인과 렌더러가 각자 하고, `shared/`는 그 둘을 모른다. `state`는 CSS가 쓰는 값이라 계산 쪽에 남는다. 요일은
  카탈로그가 아니라 `Intl`이 만든다(언어마다 일곱 개를 손으로 적을 이유가 없다) — 나머지
  모양은 `Intl`이 아니다. 한국어 전체 형식은 `8. 3. (월)`이라 칩보다 넓고 원래 `8/3`과 다르다.
- **`shared/export.ts`에는 카탈로그도 `t`도 없다.** `buildSnapshot(tasks, now, space, {t, locale})`이
  **쓸 문자열을 전부 스냅샷 안에 박아** 넘기고, `toMarkdown`·`toHtml`은 그 객체만 읽는다.
  마감일이 이미 그랬던 것(인쇄물은 나중에 다시 계산할 수 없다)을 문서 전체로 넓힌 것이다.
  그래서 `shared/`가 `main/`을 require하지 않는다.
- **마크업이 들어가는 문자열**은 `<b>`·`<em>`·`<code>` 셋만 되고 `tNodes()`가 파싱한다.
  `innerHTML`이 아니다. `data-i18n-attr`는 `title` 또는 `title=다른.키` 형태를 받는다.
- **가이드 탭은 문단이 키 하나다** (`guide.*`, 88개). 목록 항목도 한 항목이 한 문단이라 키
  하나다. 문장 단위로 자르지 말 것 — 언어마다 문장을 나누는 지점이 달라서 조각을 주면 번역이
  안 된다. **`index.html`의 그 문단들은 비어 있다**: 예순 몇 개를 마크업과 카탈로그에 두 번
  적으면 어긋날 자리가 예순 몇 개고, 마크업 쪽은 어차피 화면에 안 나간다. 정확히는 88개 중
  **67개가 비어 있고, 짧은 제목·꼬리표 21개만 영어 그대로 남아 있다**(`guide.title`,
  `guide.q1.tag`, `guide.tasksTitle` 등). 낱말 몇 개짜리라 어긋날 여지가 없고, `FALLBACK`이
  `en`이라 카탈로그가 안 붙는 최악의 경우에도 읽히는 값이 된다.
  **비어 있지 않은 것을 보고 빠뜨린 줄로 읽지 말 것.** 세는 법은 이렇다:
  `data-i18n="guide.*"`를 뽑아 여는 태그 뒤 텍스트가 비었는지 보면 된다 — 숫자를 기억으로
  적지 말 것.
- **한글 문단을 카탈로그로 옮길 때는 손으로 옮겨 적지 말 것.** 마크업에서 뽑아내는 스크립트를
  쓴다 — 합격 기준이 "한 글자도 안 바뀐다"인데 마흔 몇 문단을 타이핑하면 틀릴 자리가 마흔 몇
  군데다. 검증도 같은 방식이다: 변경 전 커밋의 소스에서 한글 구절을 전부 뽑아 `ko.json`과
  **한글만 남긴 골격**으로 대조한다(보간자가 `${x}`에서 `{{x}}`로 바뀌므로).
- **사용자 문자열은 전부 카탈로그로 나갔다** — `node tools/find-untranslated.js`가 0이다.
  문서 027·028 참고.

## 검증

`npm test` (`node --test`, 추가 의존성 없음) 가 `src/shared/`의 순수 함수만 덮는다 —
데이터가 날아가는 규칙(정규화 기본값, quadrant 유효성, temp+rename 저장, 손상 파일 폴백)이
여기 들어 있으니 이 파일들을 건드렸으면 반드시 돌린다. UI는 커버되지 않는다.

**사용자가 패키징된 exe를 띄워둔 채인 경우가 많고, 그러면 단일 인스턴스 락 때문에
`npm start`가 조용히 죽는다.** 사용자 앱을 끄지 말고 데이터 폴더를 갈라서 띄울 것:

```
npx electron . --user-data-dir=<임시폴더> --remote-debugging-port=9333
```

`--user-data-dir`은 `app.getPath('userData')`를 통째로 바꾸므로 락도 따로 잡고 실제
`data.json`도 건드리지 않는다. 그 폴더에 `data.json`을 미리 써두면 원하는 상태로 시작할 수
있다 (**폴더 바로 아래** — 하위에 `Nekan/`을 또 만들면 안 읽히고
`migrateLegacyStore()`가 옛 데이터를 끌어온다). GUI 클릭은 좌표로 쏘지 말고 CDP로
`Runtime.evaluate`를 보내 `document.querySelector(...).click()`을 하는 게 확실하다
(Node 22의 전역 `WebSocket`이면 의존성 없이 붙는다). 창 스크린샷은 다른 창에 가려도
`PrintWindow(hwnd, hdc, 2)`로 찍힌다 — `CopyFromScreen`은 검게 나온다.

**서버 규칙은 `npm test`가 못 덮는다.** LWW와 커서는 `supabase/migrations/0001_tasks.sql`의
트리거 안에 있고, 트리거는 **써 봐야만** 확인된다. 마이그레이션을 고쳤으면 반드시 돌릴 것:

```sh
NEKAN_SUPABASE_URL=... NEKAN_SUPABASE_ANON_KEY=... node supabase/verify.js
```

두 계정으로 기기 두 대를 흉내 내 19가지를 본다
(LWW·동점·묘비·삭제 차단·RLS 격리·커서·페이지 넘기기·RPC 권한).
**이 스크립트는 여러 번 돌려도 같은 결과가 나와야 한다** — 첫 판은 고정 타임스탬프를 써서
딱 한 번만 통과했다. 두 번째 판부터는 앞 실행이 남긴 행이 더 새것이라 트리거가 (정확하게)
버렸기 때문이다. **빈 테이블에서만 통과하는 검증은 검증이 아니다.**

**계정 삭제 4가지는 기본으로 안 돈다(SKIP).** 자동화가 불가능해졌기 때문이다: 프로젝트가
확인 메일을 켜면서 `signup`이 세션 없이 사용자만 만들고, 이어지는 로그인은
`email_not_confirmed`로 막히며, 그 메일은 `@example.com`으로 가서 아무도 못 읽는다.
먼저 보이는 429(발송 쿼터)는 표면일 뿐 쿼터가 남아도 길이 없다. 돌리려면 **대시보드
Authentication → Users → Add user에서 Auto Confirm으로 일회용 계정을 만들어** 넘긴다:

```sh
NEKAN_VERIFY_LEAVING=<이메일>:<비밀번호> node supabase/verify.js
```

**그 계정은 검사로 사라진다** — 검사의 내용이 그것이라서, 돌릴 때마다 새로 만들어야 한다.
그래서 옵트인이다. **`nekan-dev`·`nekan-other`를 넘기지 말 것.** 2026-08-08에 `nekan-dev`가
실제로 지워져 대시보드에서 다시 만들어야 했다 — 그 계정이 없으면 위 19가지가 통째로 안 돈다.
**SKIP도 요약에 세어진다**(`19 passed, 0 failed, 1 skipped`). 예전에는 일회용 계정 생성이
실패하면 **거기서 예외로 죽어** 뒤의 RPC 권한·묘비 청소 검사가 안 돌고 요약도 안 나왔다 —
마이그레이션이 진짜로 깨졌을 때와 화면이 똑같았다.

**로그인 경로도 `npm test`가 못 덮는다** (safeStorage가 Electron 안에서만 산다). `--user-data-dir`로
띄워 `window.api.login(...)`을 CDP로 부르고, `auth.json`에 `eyJ`가 **평문으로 없는지**와
재시작 후 `state:load`의 `auth`가 남는지를 본다. 시간이 걸리는 두 가지는 이렇게 앞당겼다:

- **갱신(회전)**: `shared/auth.ts`의 `REFRESH_SKEW_MS`를 잠깐 2시간으로 올리면 **시작할 때마다**
  갱신이 돈다. `auth.json`이 바뀌는 것이 곧 성공 신호다 — 그 파일은 `remember()`에서만 쓰이고
  `remember()`는 로그인·갱신 성공에서만 불린다. **끝나면 60초로 되돌릴 것.**
- **죽은 토큰**: 로그인 → `auth.json` 복사 → 로그아웃(서버가 폐기) → 복사본을 되돌려놓고 실행.
  `auth.json`이 **사라지면** 4xx 경로가 맞게 돈 것이다(`forget()`은 로그아웃과 이 경로에서만
  불린다). 사라지지 않으면 네트워크 실패와 폐기를 구분하지 못하고 있는 것이다.

**동기화는 기기 두 대를 띄워야 확인된다.** 프로필과 디버깅 포트를 갈라 두 번 띄우면 된다:

```
npx electron . --user-data-dir=<A> --remote-debugging-port=9333
npx electron . --user-data-dir=<B> --remote-debugging-port=9334
```

**프로필 폴더에 빈 `data.json`을 먼저 써 둘 것.** 안 그러면 `migrateLegacyStore()`가
`%APPDATA%\EisenhowerMatrix`의 **진짜 데이터**를 끌어와 서버로 올려버린다. 한쪽에서 항목을
추가하고 6초쯤 뒤 다른 쪽에서 **아무 항목이나 추가하면**(그게 그쪽 sync를 3초 뒤로 당긴다)
건너온 것이 보인다 — 안 그러면 60초 하트비트를 기다려야 한다.

**`.hidden`은 전역 규칙이 아니다.** 영역마다 자기 것을 선언한다(`.chip.hidden`,
`.view.hidden`, `.memo .hidden`, `.account .hidden`). 새 스타일시트를 만들면서 이걸 빠뜨리면
**클래스는 붙는데 아무 일도 일어나지 않는다** — `display`를 정하는 규칙이 뒤에 오면 한 클래스짜리
`.hidden`은 항상 진다. 계정 패널이 로그인 전/후 두 쪽을 동시에 보여준 것이 이 때문이었다.
`classList.contains('hidden')`으로 검증하면 **통과한다** — 반드시 `offsetParent`나 스크린샷으로
볼 것.

**검증용 하니스에서 두 번째 `BrowserWindow`의 `loadFile`은 `ERR_FAILED (-2)`로 죽는다**
(2026-08-18 실측, 한 프로세스 안에서 앞 창을 `destroy()`한 뒤). 페이지 내용과 무관한데
**내용 탓으로 두 번 읽었다** — 2.7MB data: URI가 커서 실패한 줄 알았고, 다음엔 새로 넣은
`@font-face` 탓인 줄 알았다. 순서를 뒤집으면 실패가 따라 옮겨간다. **케이스마다 프로세스를
가를 것.** 그리고 **씨앗 데이터에 검사어를 넣지 말 것** — 할 일 텍스트에 `Pretendard`가 있어서
"스타일시트에 글꼴 이름이 남았나" 가드가 본문에 걸렸다. 검사는 `<style>` 블록으로 좁힌다.

**메인 프로세스 코드는 `location.reload()`로 갱신되지 않는다.** 렌더러만 다시 그려질 뿐이고,
`main/window.ts`의 상수를 고친 뒤 리로드해서 재면 **옛 값이 계속 나온다** — 2026-08-19에
`BAR.width`를 684로 바꾸고도 660이 나와서 한참 헤맸다. 메인을 건드렸으면 **앱을 다시 띄울 것.**

**CDP 입력이 안 먹는 것처럼 보이면 먼저 무엇이 덮고 있는지 본다.** `Input.dispatchMouseEvent`가
무시되는 줄 알고 OS 마우스(`SendInput`)로 갈아타 좌표 보정에 오래 썼는데, 실제로는 **첫 실행
카드가 이벤트를 받고 있었다.** 카드를 넘기니 CDP로 바로 됐다. 확인법은 `document`에
`pointerdown` 리스너를 붙여 **`e.target`을 찍어 보는 것**이다 — 좌표가 아니라 대상이 답을 준다.

**렌더러를 재는 곳을 헷갈리지 말 것.** `renderCounts()`가 갱신하는 것은 **바 칩**(`#c1`~`#c4`)
이고, 분면 헤더(`[data-count=q1]`)는 `renderMatrix()` 즉 **매트릭스 탭일 때만** 다시 그려진다.
가이드 탭을 열어 둔 채 분면 헤더를 읽으면 마지막 매트릭스 렌더의 잔상이 보이고, 그걸 "동기화가
화면에 반영되지 않는다"로 읽게 된다. 여기에 한 번 속았다 — 바 모드 함정과 같은 종류다.

**Google 로그인은 동의 화면 없이도 거의 다 검증된다.** 버튼을 누르면 loopback 서버가 뜨고,
**개발 실행에서는 콜백 URL을 터미널에 찍는다**(`oauth callback: http://127.0.0.1:.../callback/<state>`).
그 URL을 그대로 써서 직접 때리면 된다:

```sh
curl "<찍힌 URL>?error=access_denied"   # 거절 경로
curl "<찍힌 URL>?code=fake"             # 교환 실패 경로
curl "http://127.0.0.1:<포트>/callback"  # state 없는 요청 — 404여야 한다
```

**경로 끝의 `<state>`를 빼면 안 된다.** 콜백 서버는 그 값이 맞을 때만 응답하고 나머지는 404로
흘려보낸다 — 같은 기기의 다른 프로세스가 `?error=`를 먼저 때려 로그인을 취소시키는 것을 막는
장치다. 그래서 URL을 찍어주는 것이고, 그 로그는 `app.isPackaged`가 아닐 때만 나간다.
**state를 쿼리가 아니라 경로에 둔 이유**: Supabase가 `redirect_to`에 `?code=...`를 이어붙이는데,
`redirect_to`에 이미 쿼리가 있으면 어떻게 합쳐지는지가 불분명하다. 경로는 모호하지 않다.

`code=fake`는 Supabase가 `flow_state_not_found`로 거절하는 것이 **정상이고**, 그것이 곧
PKCE 상태가 실제로 검사된다는 증거다. 남는 미검증 구간은 Google 동의 화면 하나뿐이다.

**시계 오차는 오프셋이 0이면 아무것도 증명하지 못한다.** 개발 기기의 시계는 대개 정확해서
`CLOCK_TOLERANCE_MS`(2초) 안에 들어오고, 그러면 배관이 끊겨 있어도 똑같이 0이 나온다.
`api-client.ts`의 `skew = nextOffset(...)` 줄을 잠깐 `skew = 600_000`으로 바꿔 띄운 뒤
**새로 만든 항목의 `updatedAt`이 `Date.now()`보다 600초 앞서는지** 볼 것. 끝나면 되돌린다.

렌더러·창 동작은 여전히 `npm start`로 직접 띄워서 확인한다. 최소 확인 항목:
할 일 추가 → 완료 → 히스토리에서 되돌리기 → 삭제 → 휴지통에서 복원 → 앱 재시작 후 유지.

**목록이 커졌을 때의 동작은 손으로 못 만든다.** `tools/seed-dev-data.js`가 그 상태를 직접 쓴다:

```sh
node tools/seed-dev-data.js <임시폴더> --history 2000 --quad 500 --trash 500 --inbox 200
npx electron . --user-data-dir=<임시폴더>
```

진짜 데이터 폴더를 가리키면 거부한다.

**빌드가 있으니, 재는 것이 방금 고친 코드인지부터 본다.** `npm start`·`npm test`·`npm run dist`는
앞에 빌드가 붙어 있지만 **손으로 `npx electron .`을 부르면 붙지 않는다.** 옛 `out/`이 돈다.

**`.tsbuildinfo`는 `out/` 안에 있어야 한다.** composite 프로젝트는 그 파일이 "최신"이라고 하면
emit을 건너뛴다. 밖에 두면 `rm -rf out` 뒤의 빌드가 **오류 없이 빈 `out/`을 만들고**
"built out/"이라고 찍는다 (2026-08-22 실측).

**`node --test <디렉터리>`가 이 환경에서 동작하지 않는다** — `Cannot find module`로 죽는다.
`node --test "out/test/**/*.test.js"`처럼 glob을 준다. 인자를 아예 빼면 하위를 훑어 소스와
산출물이 둘 다 잡힌다.

**테스트를 `.ts`로 바꾸는 것만으로는 아무것도 검사되지 않는다.** `require()`는 `any`를 주므로
이름만 TypeScript인 파일이 된다. `import`로 바꿔야 타입이 흐른다. **확인법**: 일부러 틀린 줄을
심고 `npm test`가 **0이 아닌 코드로 죽는지** 본다. 2026-08-22에 심은 줄이 그냥 통과했고,
그게 `require` 때문이었다.

**내보내기 대화상자는 백그라운드에서 포커스를 못 준다.** `SetForegroundWindow`가 거절당한다.
대화상자 자체는 `EnumWindows`로 클래스 `#32770`을 찾아 확인할 수 있고(제목이 곧 `t()`가
만든 문자열이다), `PostMessage(WM_CLOSE)`로 닫으면 `export:run`이 `canceled`를 돌려준다.
**쓰는 쪽은 작은 Electron 하니스로 확인한다** — `out/shared/export.js`와 `out/main/i18n.js`를
require해서 `buildSnapshot` → `toMarkdown`/`toHtml` → 숨은 창에서 `printToPDF`까지 그대로 돌린다.
2026-08-22 실측: md 508B · html 4.8KB · **pdf 180KB**(글꼴이 박혔다는 뜻), 저장본 html에
`file://`이 **없다**(그게 규칙이다).

**테스트 프로필의 `data.json`을 PowerShell로 쓰지 말 것.** 5.1의 `Set-Content -Encoding utf8`은
**BOM을 붙이고**, `JSON.parse`가 그 파일을 거절하면 `load()`의 손상 파일 폴백이 조용히 **빈
보드**를 준다 — 앱은 아무 말도 하지 않고 할 일이 0개인 화면이 뜬다(2026-08-21 실측:
`ef bb bf`). `ConvertTo-Json`을 거치면 한글이 깨지는 것은 덤이다. `node -e`로 쓸 것.

**재기 전에 `document.body.className`부터 확인할 것.** 바 모드면 `render()`가 `renderCounts()`
다음에 바로 빠져나가므로, 무엇을 클릭하든 1~4ms가 나오고 DOM은 그대로다. 여기에 한참을 썼다 —
증상이 "빠르다"라서 성공처럼 보인다. 구분법: 바 칩(`#c1`)은 갱신되는데 분면 헤더
(`[data-count=q1]`)는 멈춰 있으면 바 모드다. 그리고 **측정 대상이 실제로 다시 그려졌는지**를
같은 측정 안에서 확인할 것(첫 행 노드가 바뀌었는지, 개수가 늘었는지). 안 그러면 아무 일도 안
일어난 것을 "빠르다"로 읽는다.

성능은 **레이아웃까지 동기로 강제해서** 재야 한다
(`document.body.offsetHeight`) — `requestAnimationFrame`은 창이 가려지면 아예 안 돌아서
2ms 같은 값이 나온다. 실측 기준: 히스토리 행 하나가 약 180µs, 그래서 렌더 상한이 100이다
(`renderer/views/archive.ts`의 `PAGE`). 검색은 한 글자마다 다시 그리므로 **한 번이 100ms 안**이어야 한다.

**업데이트 경로는 GitHub에 릴리스를 올리지 않고도 통째로 검증할 수 있다.** 설치본이 읽는
피드를 localhost로 돌려놓으면 된다:

1. 현재 버전(예: 1.0.0)으로 `npm run dist` → 그 설치 파일을 실행해 **실제로 설치**한다
   (`%LOCALAPPDATA%\Programs\Nekan`, 권한 안 물어봄). 압축만 푼 `win-unpacked`로는 안 된다 —
   electron-updater가 설치 경로를 기준으로 새 설치 파일을 돌린다.
2. `package.json`의 `version`을 잠깐 올려 다시 빌드하고, 새 `*.exe`·`*.blockmap`·`latest.yml`
   세 개를 빈 폴더에 모아 정적 서버로 띄운다. 그리고 **버전을 원래대로 되돌린다.**
3. 설치된 앱의 `resources\app-update.yml`을 `provider: generic` + `url: http://127.0.0.1:8080`
   으로 덮는다. (업데이트가 적용되면 새 빌드의 파일로 저절로 되돌아온다.)
4. **사용자 앱이 떠 있으면 락 때문에 조용히 죽으니** 설치된 exe도 `--user-data-dir`로 띄운다.
   10초 뒤 확인이 돌고, 다 받으면 `#updateBtn`의 `hidden`이 풀린다. 눌러서 재시작되는지,
   `Nekan.exe`의 `VersionInfo`가 올라갔는지 본다.
5. 끝나면 **테스트 설치본을 `Uninstall Nekan.exe /S`로 지운다.** 릴리스되지 않은 높은 버전이
   남아 있으면 나중에 진짜 릴리스가 더 낮아서 영영 업데이트가 안 온다.

옛 버전의 `.blockmap`이 피드에 없으면 차등 다운로드가 404로 실패하고 전체를 받는다 —
로그에 뜨지만 정상이다. 실제 Release에는 두 버전이 다 있어서 생기지 않는다.
