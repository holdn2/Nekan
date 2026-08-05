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
  ipc.js          ipcMain.handle 전부. 새 채널을 만들 때 첫 번째로 여는 파일
src/preload.js    contextBridge → window.api (여기 없는 건 렌더러에서 못 씀)
src/shared/       메인·렌더러·테스트가 공유. 여기만 테스트가 덮는다
  core.js         날짜·정규화·space 규칙·레이아웃 비율 등 순수 로직
  store-io.js     data.json 읽기/쓰기 (electron 의존 없음 — 경로는 호출자가 준다)
  export.js       내보내기 문서 생성 (마크다운·인쇄용 HTML). 메인·테스트만 require
src/renderer/     ES 모듈. 번들러 없음 — import 경로에 확장자를 반드시 쓴다
  index.html      정적 마크업. <link> 12개와 <script>는 순서가 의미를 갖는다
  app.js          진입점. render() 디스패처, 전역 단축키, init() 조립
  store.js        tasks 배열과 모든 변경. DOM을 모른다 → commit()이 저장+notify
  render-bus.js   "다시 그려라" 신호 하나. store·view → app 순환을 막는 장치
  core-bridge.js  shared/core.js의 전역을 named export로 재수출
  dom.js          $ · $$ · numEl · actionBtn · labelBtn
  components/     icons · due-chip · memo-mark · toast (task를 모르는 조각들)
  views/          matrix · inbox · archive · memo · inline-edit
  window/         chrome(타이틀바·탭·모드) · layout(분면 경계) · dnd · export-ui
  styles/         base부터 scrollbars까지 12개. index.html의 <link> 순서가 캐스케이드
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

## 알아두면 좋은 것

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
- **메모 패널은 매트릭스에서 높이를 뺏지 않고 창을 키운다.** 렌더러가 CSS `--memo-h`를 읽어
  `win:memo`로 넘기면 `main/window.js`가 그만큼 창을 늘리고, 실제로 늘어난 값(`memoDelta` — 화면에
  여유가 없으면 요청보다 작다)을 저장하는 `bounds`에서 다시 빼준다(`boundsWithoutMemo`). 이걸
  건너뛰면 재시작할 때마다 창이 패널 높이만큼 계속 자란다. 패널 높이를 바꿀 곳은
  `styles/base.css`의 `--memo-h` 하나뿐이다.
- **인박스("다 꺼내기")는 메모 패널과 정반대다.** 메모 패널은 창을 키우고, 인박스는 매트릭스에서
  높이를 가져간다. 그래서 `main/window.js`에 창 크기 회계가 없고 접힘 상태(`settings.inboxOpen`)만
  저장한다. 대신 목록이 4분면을 밀어내지 않도록 `styles/base.css`의 `--inbox-max-h`와 `styles/inbox.css`의 `26vh`가
  높이를 묶는다 — 이 상한을 없애면 항목이 쌓일수록 매트릭스가 화면 밖으로 나간다.
- **`main/window.js`의 `BAR.width`는 타이틀바 내용이 정한다.** 원래 440px이었는데 업무/일상 토글이
  들어가면서 한 줄이 484px을 요구해 창 버튼이 오른쪽 밖으로 밀려났고, 업데이트 버튼이 들어가며
  600 → 640px이 됐다. 바에서 빠지는 건 `.title` 텍스트와 내보내기 버튼뿐이다(아이콘·토글·칩·
  업데이트 버튼·창 버튼은 전부 남는다). **바에 뭔가를 더 넣으면 줄이지 말고 `BAR.width`를 키우고,
  반드시 실측**할 것: 개수를 전부 두 자리로 바꾸고 인박스 칩과 `#updateBtn`을 보이게 한 뒤
  `.titlebar`의 `scrollWidth`와 `#closeBtn`의 `right`를 `window.innerWidth`와 비교한다
  (현재 최악의 경우 여유 28px). `.bar-summary`가 `margin-left:auto`라 `scrollWidth`만 보면
  넘쳐도 딱 맞아 보이니, 스위치 오른쪽 끝과 `.bar-summary` 왼쪽 끝 사이 간격도 같이 볼 것.
  스크린샷은 `PrintWindow`가 오른쪽 영역을 갱신 안 된 채 찍는 일이 있으니 CDP
  `Page.captureScreenshot`을 쓸 것.
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
  샌다.
- **electron-builder는 같은 태그로 draft를 두 개 만든다.** 업로드가 병렬로 돌면서 둘 다
  "릴리스가 없네"라고 판단해 각자 만드는 경쟁 상태이고, **v1.0.0과 v1.0.1 두 번 다** 같은 식으로
  (`.blockmap`만 따로) 갈렸다 — 우연이 아니니 다음에도 갈라진다고 보면 된다. 그래서
  `npm run release`가 끝에 `tools/check-release.js`를 돌려 자동으로 합치고 파일 세 개를
  확인한다. **손으로 확인하지 말고 그 스크립트의 종료 코드를 볼 것.** 갈린 채로 publish하면
  조용히 망가진다: `latest.yml`이 없는 쪽이면 아무도 업데이트되지 않고, `.blockmap`이 없는
  쪽이면 모두가 매번 전체를 받는다.
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
