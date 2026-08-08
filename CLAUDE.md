# Nekan — 에이전트용 프로젝트 노트

아이젠하워 매트릭스 데스크톱 위젯. Electron 43, 빌드는 electron-builder.
**사용자 대상 기능 설명은 `README.md`에 있음. 이 파일은 중복하지 않고, 코드를 읽어서는 알기 어려운 것만 적는다.**

## 아키텍처 한 줄 요약

```
src/main.js       앱 생명주기와 조립만 — store 로드 → IPC 등록 → 창 생성 순서가 전부
src/main/
  store.js        메모리 위의 data.json + 디바운스 저장 (persist / persistNow)
  window.js       창 생성, expanded/collapsed 전환, 메모 패널 높이 회계
  export-service.js  PDF·HTML·MD 쓰기 (숨은 창에서 printToPDF)
  updater.js      electron-updater. 창을 모르고, main.js가 넘긴 콜백으로만 알린다
  api-client.js   Supabase와 말하는 유일한 곳. URL·anon key·로그인·토큰 갱신·시계 오차
  token-store.js  세션을 safeStorage로 암호화해 userData/auth.json에 (data.json 아님)
  sync.js         당기고 밀고 다시 시도하는 루프. 판정은 안 하고 일정만 잡는다
  oauth.js        Google 로그인의 브라우저 쪽 (PKCE + loopback). 세션은 모른다
  ipc.js          ipcMain.handle 전부. 새 채널을 만들 때 첫 번째로 여는 파일
src/preload.js    contextBridge → window.api (여기 없는 건 렌더러에서 못 씀)
src/shared/       메인·렌더러·테스트가 공유. 여기만 테스트가 덮는다
  core.js         날짜·정규화·space 규칙·레이아웃 비율 등 순수 로직
  store-io.js     data.json 읽기/쓰기 (electron 의존 없음 — 경로는 호출자가 준다)
  export.js       내보내기 문서 생성 (마크다운·인쇄용 HTML). 메인·테스트만 require
  sync.js         동기화 판정 (LWW·행 변환·커서·시계 오차). main/sync.js가 쓴다
  auth.js         세션 모양과 만료 판정. 렌더러에 나갈 필드를 여기서 고른다
src/renderer/     ES 모듈. 번들러 없음 — import 경로에 확장자를 반드시 쓴다
  index.html      정적 마크업. <link> 15개와 <script>는 순서가 의미를 갖는다
  app.js          진입점. render() 디스패처, 전역 단축키, init() 조립
  store.js        tasks 배열과 모든 변경. DOM을 모른다 → commit()이 저장+notify
  render-bus.js   "다시 그려라" 신호 하나. store·view → app 순환을 막는 장치
  core-bridge.js  shared/core.js의 전역을 named export로 재수출
  dom.js          $ · $$ · numEl · actionBtn · labelBtn
  components/     icons · due-chip · memo-mark · toast (task를 모르는 조각들)
  views/          matrix · inbox · archive · memo · inline-edit · account · settings · welcome
  window/         chrome(타이틀바·탭·모드) · layout(분면 경계) · dnd · export-ui
  styles/         base부터 scrollbars까지 15개. index.html의 <link> 순서가 캐스케이드
                  switch.css만 영역이 아니라 부품이다 — 두 곳이 쓰므로 base 바로 뒤
test/             node --test 용 단위 테스트 (shared/ 만 커버)
```

**의존 방향은 한쪽이다**: `core-bridge/dom → store → views → app.js`. 아무도 `app.js`를
import하지 않는다. 화면을 다시 그려야 하는 쪽(store의 `commit()`, memo의 선택 변경)은
`render-bus.js`의 `notify()`를 부르고, `app.js`가 `subscribe(render)`로 한 번만 받는다.
**뷰에서 `app.js`를 import하면 이 구조가 깨진다** — 필요하면 `notify()`를 쓸 것.

**`src/shared/core.js`는 두 가지 방식으로 로드된다**: 메인·테스트는 `require`, 렌더러는
모듈 그래프보다 먼저 실행되는 고전 `<script>`. 그래서 이 파일은 Node·DOM API를 쓰면 안 된다.
렌더러에서는 export 목록을 `window.EM_CORE`로 넘기고 `core-bridge.js`가 그걸 재수출한다 —
고전 스크립트의 최상위 `const`는 `window`의 속성이 **아니라서** 모듈이 직접 볼 수 없기
때문이다. 그 객체 이름이 `emCore`인 이유도 같은 성질 때문이다: `api`로 두면 preload가 이미
노출한 `window.api`와 최상위 선언이 충돌해 **파일 전체가 SyntaxError로 죽는다.**

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
  `normalizeTasks()`와 `renderer/store.js`의 `makeTask`/`moveTask`가 같은 함수를 부른다. 규칙은 하나뿐이다:
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
    `main/store.js`의 `load()`가 시작할 때 한 번 부른다 (TTL 90일).
- **분면 안의 순서는 배열 위치가 아니라 `orderKey`다.** 문자열을 사전순으로 비교하고
  (`compareOrder`), 두 행 사이에 끼울 키는 `orderKeyBetween()`이 만든다 — 한 행만 쓰면 되므로
  이동이 전체 목록 쓰기가 되지 않는다. 키는 **`(quadrant, space)` 조합 안에서만** 유효하니
  다른 분면의 키와 비교하지 말 것. **배열을 재정렬하고 화면이 따라오길 기대하면 안 된다.**
  목록을 뽑는 곳은 전부 `compareOrder`로 정렬해야 한다(`activeOf`, `export.js`의 `inList`).
- **task 스키마에 필드를 추가하면 기존 `data.json`에는 그 필드가 없다.** `shared/core.js`의
  `normalizeTasks()`에서 기본값을 채워줘야 한다. 마이그레이션 코드 없이 필드를 읽으면 기존
  사용자 데이터에서 `undefined`가 된다. **값이 이상하면 화면에서 사라지는 필드**(`quadrant`
  처럼 렌더링 분기에 쓰이는 것)는 기본값만이 아니라 유효성까지 여기서 잡아준다.
- **저장은 temp write + rename** (`shared/store-io.js` `writeStore`). 이 패턴을 단순
  `writeFileSync`로 바꾸지 말 것 — 쓰다 끊기면 전체 할 일이 사라진다.
- IPC를 새로 추가할 때는 **세 곳을 모두** 건드려야 한다: `main/ipc.js`의 `ipcMain.handle`,
  `preload.js`의 `exposeInMainWorld`, 렌더러의 `window.api.*` 호출.
- **토큰은 IPC를 건너지 않는다.** `window.api`에 토큰을 돌려주는 함수가 **하나도 없어야** 한다.
  렌더러가 알 수 있는 것은 `state:load`의 `auth`(= `{ email, userId }`)뿐이고, 그 객체는
  `shared/auth.js`의 `publicSession()`이 **필드를 골라서** 만든다 — 지우는 방식이 아니라
  고르는 방식인 이유가 있다. 세션에 필드를 추가해도 여기 이름을 적지 않는 한 새어나가지 않는다.
- **렌더러의 `Date.now()`를 직접 쓰지 않는다.** `renderer/store.js`의 `now()`가
  `Date.now() + clockOffset`이고, 오프셋은 메인이 서버 응답의 `Date` 헤더로 재서 넘긴다.
  **`updatedAt`이 LWW의 기준이라, 시계가 10분 느린 기기는 그 기기의 모든 편집을 조용히 잃는다.**
  이 파일에 타임스탬프를 새로 쓸 일이 생기면 `now()`를 쓸 것 (`uid()`만 예외 — 비교용이 아니다).
- **`state:save`는 덮어쓰기가 아니라 병합이다** (`main/store.js`의 `mergeRendererTasks`).
  렌더러가 마지막으로 그린 뒤 pull이 끼어들 수 있고, 그때 통째로 덮으면 방금 받은 행이 사라진다.
  병합이 안전한 이유는 **task를 배열에서 지우는 일이 없기 때문**이다 — 삭제가 타임스탬프라
  "정당하게 행이 빠진 저장"이란 것이 존재하지 않는다. 동점은 렌더러가 이긴다(화면에 있는 쪽).
- **sync는 로컬 task를 절대 지우지 않는다.** 로그아웃해도 `data.json`은 그대로다. 커서와
  푸시 워터마크(`settings.sync`)만 비운다 — 계정이 바뀌면 남의 커서 때문에 행을 통째로 건너뛴다.
- **커서는 진실이 아니라 최적화다.** `server_seq`는 트랜잭션 안에서 발급돼서, 먼저 커밋된 행이
  더 큰 번호를 가질 수 있다. 그 틈에 pull이 들어가면 행 하나를 영영 건너뛴다. 그래서
  `main/sync.js`가 **시작할 때와 6시간마다 커서를 버리고 전체를 다시 읽는다**(`RECONCILE_MS`).
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

- **비밀번호 로그인은 패키징된 빌드에 존재하지 않는다.** `main/ipc.js`가 `auth:login`을
  `!app.isPackaged`일 때만 등록한다. 사용자에게 열린 길은 Google 하나뿐이고, 비밀번호는
  **사람이 동의 화면을 누르지 않고도 동기화를 검증하기 위한** 개발용 통로다. 가이드의 개발용
  폼도 `state:load`의 `devLogin`을 보고 그때만 나온다. 이 통로를 없애면 **동기화를 자동으로
  검증할 방법이 사라진다** — 없애기 전에 대체 수단을 먼저 만들 것.
- **Google 로그인은 시스템 브라우저로 나갔다가 loopback으로 돌아온다** (`main/oauth.js`).
  포트는 `listen(0)`으로 OS가 고른다 — 그래서 Supabase의 Redirect URL 허용목록에
  `http://127.0.0.1:*`가 있어야 한다. 와일드카드를 못 쓰게 되면 고쳐야 할 곳은 그 `listen(0)`
  한 줄이다. 앱 안 webview를 쓰면 **Google이 막는다.**
- **콜백 서버는 `/callback`이 아닌 요청을 404로 흘려보낸다.** 브라우저가 보내는 favicon 요청
  하나에 로그인이 끝나버리면 안 되기 때문이다.
- **브라우저 마지막 화면에 "로그인되었습니다"라고 쓰지 말 것.** 그 시점에 일어난 일은 코드가
  돌아온 것뿐이고, 교환은 그 다음에 실패할 수 있다. 판정은 앱이 한다.

- `app.setName('Nekan')`이 `main.js` 최상단에 있는 이유: `npm start`와 패키징된
  exe가 **같은** `%APPDATA%\Nekan\data.json`을 보게 하려고. 지우면 개발용/배포용
  데이터가 갈라진다. **이름이 바뀔 때마다 이 폴더도 바뀐다** — 그래서
  `main/store.js`의 `legacyStorePaths()`가 옛 폴더를 **최신순 배열**로 넘기고
  (`Nekan` ← `EisenhowerMatrix` ← `eisenhower-matrix`), `migrateLegacyStore()`가
  존재하는 첫 파일 하나만 복사한다. **대상 파일이 이미 있으면 절대 덮지 않는다** —
  덮으면 실행할 때마다 살아 있는 데이터가 옛 사본으로 되돌아간다.
  또 이름을 바꾼다면: 새 이름을 `setName()`에 넣고, **직전 이름을 배열 맨 앞에** 넣는다
  (배열은 최신순이고, 존재하는 첫 항목이 이긴다).
- **창 크기는 expanded 모드의 것만 저장한다** (`main/window.js`의 `rememberPlacement`). 바 크기가
  저장돼버리면 다음 실행 때 600×48로 열린다. 바는 **위치만** `settings.barPosition`에 따로 남는다.
- **`ready-to-show`는 렌더러의 `state:load`가 끝난 뒤에 온다.** 그래서 시작할 때의 접기
  (`settings.mode === "collapsed"`)를 렌더러가 볼 방법이 없다 — `state.mode`를 읽는 시점에는
  아직 `expanded`이고, 바는 그 뒤에 `win:mode` 푸시로 온다. **시작 모드에 조건을 걸 곳은
  `main/window.js`의 `ready-to-show` 한 곳뿐이다.** 첫 실행 선택 화면이 실제로 그랬다:
  렌더러에서 `window.api.expand()`를 부르는 조건이 **한 번도 참이 되지 않아**, 바 모드로
  종료했던 사용자가 업데이트 후 380px 카드를 **640×48 바 안에서** 만났다. 판정은
  `shared/core.js`의 `needsStartupChoice()`에 있고 메인·렌더러가 같은 함수를 부른다.
- **모드 전환의 기준점은 창에 물어보지 않고 저장된 값을 쓴다.** `expand()`는 `barPosition`에서,
  `collapse()`는 `bounds`에서 출발한다. `win.getBounds()`로 재면 배율이 걸린 화면에서 요청값과
  1~2px 어긋난 값이 돌아오고, 그걸로 다음 전환의 기준을 잡으면 **토글할 때마다 위젯이 몇 px씩
  화면을 걸어간다**(실측으로 왕복당 +4px). 같은 이유로 `switching` 플래그가 켜져 있는 동안에는
  `rememberPlacement`가 아무것도 저장하지 않는다 — 전환·창 생성이 일으킨 resize/move는
  사용자가 옮긴 것이 아니다.
- 어느 모서리를 기준으로 펼치고 접을지는 `shared/core.js`의 `expandOrigin()`·`collapseOrigin()`
  **두 순수 함수에만** 있다. 화면 오른쪽에 붙은 바는 오른쪽 끝을 맞춰 왼쪽으로 자라고, 오른쪽
  절반에 있는 창은 오른쪽 끝으로 접힌다. 이 둘이 짝이라 왕복해도 제자리다 — 한쪽만 고치면
  토글할 때마다 위젯이 이동한다.
- 분면 비율 `layout.cols/rows`는 0.15~0.85로 클램프된다. 상수와 클램프 함수는
  `shared/core.js` 한 곳에만 있고 `main/ipc.js`와 `renderer/window/layout.js`가 그걸 부른다.
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
- **메모 패널은 매트릭스에서 높이를 뺏지 않고 창을 키운다.** 렌더러가 CSS `--memo-h`를 읽어
  `win:memo`로 넘기면 `main/window.js`가 그만큼 창을 늘리고, 실제로 늘어난 값(`memoDelta` — 화면에
  여유가 없으면 요청보다 작다)을 저장하는 `bounds`에서 다시 빼준다(`boundsWithoutMemo`). 이걸
  건너뛰면 재시작할 때마다 창이 패널 높이만큼 계속 자란다. 패널 높이를 바꿀 곳은
  `styles/base.css`의 `--memo-h` 하나뿐이다.
- **인박스("다 꺼내기")는 메모 패널과 정반대다.** 메모 패널은 창을 키우고, 인박스는 매트릭스에서
  높이를 가져간다. 그래서 `main/window.js`에 창 크기 회계가 없고 접힘 상태(`settings.inboxOpen`)만
  저장한다. 대신 목록이 4분면을 밀어내지 않도록 `styles/base.css`의 `--inbox-max-h`와 `styles/inbox.css`의 `26vh`가
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
- **`main/window.js`의 `BAR.width`는 타이틀바 내용이 정한다.** 원래 440px이었는데 업무/일상 토글이
  들어가면서 한 줄이 484px을 요구해 창 버튼이 오른쪽 밖으로 밀려났고, 업데이트 버튼이 들어가며
  600 → 640px이 됐다. 바에서 빠지는 건 `.title` 텍스트와 그 옆 버전 표시뿐이다(아이콘·토글·칩·
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
  스크린샷은 `PrintWindow`가 오른쪽 영역을 갱신 안 된 채 찍는 일이 있으니 CDP
  `Page.captureScreenshot`을 쓸 것.
  **테마·내보내기가 설정 패널로 들어가면서 바 버튼이 하나 줄고 톱니바퀴가 하나 늘어 순증은
  0이다** — 그때까지 실측 여유는 28px이었다(2026-08-07). 동기화 상태는 56px 칩 대신 톱니바퀴의 점이라
  **폭을 쓰지 않고 바에서도 보인다.**
  **바에서 빠지는 것은 `collapsed.css`가 이름으로 적은 것뿐이다.** `.brand` 안에 넣었다고
  따라 빠지지 않는다 — 동기화 칩이 그래서 바에 남아 있었고(실측 56px, 여유는 28px),
  `collapsed.css`에 한 줄 더 적어서야 빠졌다. **클래스만 보지 말고 실제로 안 보이는지 볼 것.**
  **빠지는 자리(`.title`·`.app-version`)에 넣으면 폭이 안 든다** — `#exportBtn`은 설정
  패널로 옮겨가면서 **DOM에서 아예 사라졌으니** 그 자리를 세지 말 것(2026-08-07 확인). 버전
  표시가 그렇게 들어갔고 그때도 실측 여유는 그대로였다. 늘 보일 필요가 없는 것은 이쪽을 먼저 볼 것.
- **`views/settings.js`는 `window/chrome.js`를 import하지만 그 반대는 안 된다.** 테마 세그먼트
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
  ③ **`<body class="booting">`은 `app.js`의 `releaseSwitches()`가 뗀다.** 저장된 보드·테마는
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
  항목이 통째로 빠진다. PDF는 `shared/export.js`의 HTML을 **숨은 BrowserWindow**에서
  `printToPDF`로 찍는다(앱 창을 재사용하면 매트릭스 위에 문서가 번쩍인다). 그래서 인쇄물
  모양을 바꿀 곳은 `shared/export.js`의 `toHtml()` 하나뿐이고, `renderer/styles/`와는 무관하다.
- **자동 업데이트는 `app.isPackaged`가 아니면 아예 시작하지 않는다.** `npm start`에는 읽을
  `app-update.yml`이 없어서 매번 실패할 뿐이고, 개발 중인 앱이 릴리스본으로 자기를 갈아치우는
  것도 원하는 일이 아니다. **그래서 `npm start`로는 업데이트 경로를 한 줄도 검증할 수 없다** —
  아래 "검증"의 로컬 피드 절차를 쓸 것.
  화면에 나오는 상태는 `ready` **하나뿐이다.** 확인·다운로드 중에 버튼을 띄우면 눌러도 아무
  일이 없는 죽은 버튼이 되고, 어차피 `autoInstallOnAppQuit`이라 닫으면 적용된다 — 버튼은
  "지금 당길래?"라는 선택지일 뿐이다. 상태를 늘리고 싶으면 그 상태에서 **사용자가 할 수 있는
  일이 있는지** 먼저 물을 것.
  `updater.js`는 `BrowserWindow`를 모른다. 알림은 `main.js`가 넘긴 콜백 한 개로만 나가고,
  그 콜백이 `getWindow()`를 부른다. 여기서 window를 직접 import하면 조립이 main.js 밖으로
  샌다. **포커스로 확인을 거는 것도 `app.on("browser-window-focus")`라 이 규칙을 안 깬다** —
  창을 건네받지 않아도 되는 유일한 형태다.
- **확인 시점은 셋이고 전부 `checkIfDue()`를 지난다** (첫 확인만 `check()` 직행):
  포커스 획득 · `powerMonitor`의 `resume` · 6시간 타이머. **`MIN_GAP_MS`(30분) 스로틀이
  없으면 안 된다** — 최소화했다 복원하면 `browser-window-focus`가 **30ms 안에 두 번** 온다
  (2026-08-08 실측). 스로틀 기준은 `status.checkedAt`이 아니라 **마지막으로 물어본 시각
  (`askedAt`)**이다. 전자는 답이 와야 움직여서, 연속 실패 중에는 매번 다시 묻게 된다.
  `initUpdater()`가 `askedAt`을 **지금으로 초기화하는 이유**도 같은 실측이다: 창을 처음
  띄우는 것 자체가 포커스 이벤트라, 초기화가 없으면 시작 0.7초 만에 확인이 나가
  `FIRST_CHECK_MS`(10초)가 무의미해진다.
  `powerMonitor`는 **app ready 전에는 쓸 수 없어서** 파일 최상단이 아니라 `initUpdater()`
  안에서 `require`한다. `main.js`는 이 파일을 `whenReady()`보다 훨씬 먼저 부른다.
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
- **마감일 표시는 "오늘" 기준이라 시간이 지나면 틀려진다.** `renderer/app.js`의
  `scheduleDayRollover()`가 자정에 재렌더하고, 포커스 복귀·visibilitychange에서도
  날짜가 바뀌었으면 다시 그린다 (절전에서 깨어난 경우 대비).
- 메인이 보내는 `win:mode` 푸시는 렌더러의 `onMode` 등록보다 먼저 도착할 수 있다. 그래서
  등록은 `init()`의 **첫 await 이전**에 하고, `state:load`가 준 `mode`보다 푸시된 값을
  우선한다. 이 순서를 바꾸면 "창은 바 모드인데 내용은 확장 레이아웃"이 가끔 재현된다.
- 단일 인스턴스 락이 걸려 있어서, **앱이 이미 떠 있으면 `npm start`가 조용히 죽는다.**
  실행이 안 되는 것처럼 보이면 먼저 기존 프로세스를 확인할 것.

## 작업 규칙

- 코드 주석/커밋 메시지는 영어, 사용자 대화와 문서는 한국어.
- **렌더러 import 경로에는 `.js` 확장자를 반드시 쓴다.** 번들러가 없어서 브라우저 해석기가
  그대로 읽는다 — `from './store'`는 404로 죽는다.
- 기능을 바꾸면 `README.md`의 해당 섹션도 같이 고친다.
- 되돌리기 어려운 결정을 내렸으면 `docs/DECISIONS.md`에 한 줄 남긴다.
- **작업을 마칠 때마다 커밋한다.** 컨텍스트가 날아가도 커밋 로그가 남으면 복구된다.

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

두 계정으로 기기 두 대를 흉내 내 22가지를 본다
(LWW·동점·묘비·삭제 차단·RLS 격리·커서·페이지 넘기기·계정 삭제·RPC 권한).
**이 스크립트는 여러 번 돌려도 같은 결과가 나와야 한다** — 첫 판은 고정 타임스탬프를 써서
딱 한 번만 통과했다. 두 번째 판부터는 앞 실행이 남긴 행이 더 새것이라 트리거가 (정확하게)
버렸기 때문이다. **빈 테이블에서만 통과하는 검증은 검증이 아니다.**

**로그인 경로도 `npm test`가 못 덮는다** (safeStorage가 Electron 안에서만 산다). `--user-data-dir`로
띄워 `window.api.login(...)`을 CDP로 부르고, `auth.json`에 `eyJ`가 **평문으로 없는지**와
재시작 후 `state:load`의 `auth`가 남는지를 본다. 시간이 걸리는 두 가지는 이렇게 앞당겼다:

- **갱신(회전)**: `shared/auth.js`의 `REFRESH_SKEW_MS`를 잠깐 2시간으로 올리면 **시작할 때마다**
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
`api-client.js`의 `skew = nextOffset(...)` 줄을 잠깐 `skew = 600_000`으로 바꿔 띄운 뒤
**새로 만든 항목의 `updatedAt`이 `Date.now()`보다 600초 앞서는지** 볼 것. 끝나면 되돌린다.

렌더러·창 동작은 여전히 `npm start`로 직접 띄워서 확인한다. 최소 확인 항목:
할 일 추가 → 완료 → 히스토리에서 되돌리기 → 삭제 → 휴지통에서 복원 → 앱 재시작 후 유지.

**목록이 커졌을 때의 동작은 손으로 못 만든다.** `tools/seed-dev-data.js`가 그 상태를 직접 쓴다:

```sh
node tools/seed-dev-data.js <임시폴더> --history 2000 --quad 500 --trash 500 --inbox 200
npx electron . --user-data-dir=<임시폴더>
```

진짜 데이터 폴더를 가리키면 거부한다.

**재기 전에 `document.body.className`부터 확인할 것.** 바 모드면 `render()`가 `renderCounts()`
다음에 바로 빠져나가므로, 무엇을 클릭하든 1~4ms가 나오고 DOM은 그대로다. 여기에 한참을 썼다 —
증상이 "빠르다"라서 성공처럼 보인다. 구분법: 바 칩(`#c1`)은 갱신되는데 분면 헤더
(`[data-count=q1]`)는 멈춰 있으면 바 모드다. 그리고 **측정 대상이 실제로 다시 그려졌는지**를
같은 측정 안에서 확인할 것(첫 행 노드가 바뀌었는지, 개수가 늘었는지). 안 그러면 아무 일도 안
일어난 것을 "빠르다"로 읽는다.

성능은 **레이아웃까지 동기로 강제해서** 재야 한다
(`document.body.offsetHeight`) — `requestAnimationFrame`은 창이 가려지면 아예 안 돌아서
2ms 같은 값이 나온다. 실측 기준: 히스토리 행 하나가 약 180µs, 그래서 렌더 상한이 100이다
(`renderer/views/archive.js`의 `PAGE`). 검색은 한 글자마다 다시 그리므로 **한 번이 100ms 안**이어야 한다.

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
