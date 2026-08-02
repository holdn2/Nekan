# EisenhowerMatrix — 에이전트용 프로젝트 노트

아이젠하워 매트릭스 데스크톱 위젯. Electron 43, 빌드는 electron-builder.
**사용자 대상 기능 설명은 `README.md`에 있음. 이 파일은 중복하지 않고, 코드를 읽어서는 알기 어려운 것만 적는다.**

## 아키텍처 한 줄 요약

```
src/main.js       앱 생명주기와 조립만 — store 로드 → IPC 등록 → 창 생성 순서가 전부
src/main/
  store.js        메모리 위의 data.json + 디바운스 저장 (persist / persistNow)
  window.js       창 생성, expanded/collapsed 전환, 메모 패널 높이 회계
  export-service.js  PDF·HTML·MD 쓰기 (숨은 창에서 printToPDF)
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
  헤더 개수·내보내기가 전부 활성 space 기준이다. 특히 `tasks`를 통째로 `filter`하는 일괄
  작업(휴지통 비우기)은 **id 집합을 먼저 모아서** 지워야 한다 — 조건으로 지우면 화면에 없는
  반대쪽 보드까지 날아간다.
- **task는 절대 배열에서 지우지 않는다.** 상태는 세 개의 타임스탬프 필드로만 표현한다:
  - 활성: `completedAt === null && deletedAt === null`
  - 완료(히스토리): `completedAt !== null`
  - 휴지통: `deletedAt !== null`
  - 실제 `filter`로 제거하는 곳은 `purgeTask()` (영구 삭제) 단 하나뿐이다.
- **task 스키마에 필드를 추가하면 기존 `data.json`에는 그 필드가 없다.** `shared/core.js`의
  `normalizeTasks()`에서 기본값을 채워줘야 한다. 마이그레이션 코드 없이 필드를 읽으면 기존
  사용자 데이터에서 `undefined`가 된다. **값이 이상하면 화면에서 사라지는 필드**(`quadrant`
  처럼 렌더링 분기에 쓰이는 것)는 기본값만이 아니라 유효성까지 여기서 잡아준다.
- **저장은 temp write + rename** (`shared/store-io.js` `writeStore`). 이 패턴을 단순
  `writeFileSync`로 바꾸지 말 것 — 쓰다 끊기면 전체 할 일이 사라진다.
- IPC를 새로 추가할 때는 **세 곳을 모두** 건드려야 한다: `main/ipc.js`의 `ipcMain.handle`,
  `preload.js`의 `exposeInMainWorld`, 렌더러의 `window.api.*` 호출.

## 알아두면 좋은 것

- `app.setName('EisenhowerMatrix')`가 `main.js` 최상단에 있는 이유: `npm start`와 패키징된
  exe가 **같은** `%APPDATA%\EisenhowerMatrix\data.json`을 보게 하려고. 지우면 개발용/배포용
  데이터가 갈라진다. `migrateLegacyStore()`는 이 이름을 고정하기 전 데이터를 옮겨오는 코드다.
- 창 위치(`bounds`)는 **expanded 모드일 때만** 저장한다 (`main/window.js`의 `rememberBounds`). 바 모드 크기가
  저장돼버리면 다음 실행 때 440×48로 열린다.
- 분면 비율 `layout.cols/rows`는 0.15~0.85로 클램프된다. 상수와 클램프 함수는
  `shared/core.js` 한 곳에만 있고 `main/ipc.js`와 `renderer/window/layout.js`가 그걸 부른다.
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
  들어가면서 한 줄이 484px을 요구해 창 버튼이 오른쪽 밖으로 밀려났다. 지금은 600px이고,
  바에서 빠지는 건 `.title` 텍스트와 내보내기 버튼뿐이다(아이콘·토글·칩·창 버튼은 전부 남는다).
  **바에 뭔가를 더 넣으면 줄이지 말고 `BAR.width`를 키우고, 반드시 실측**할 것: 개수를 전부
  두 자리로 바꾸고 인박스 칩을 보이게 한 뒤 `.titlebar`의 `scrollWidth`와 `#closeBtn`의
  `right`를 `window.innerWidth`와 비교한다(현재 최악의 경우 여유 20px). `.bar-summary`가
  `margin-left:auto`라 `scrollWidth`만 보면 넘쳐도 딱 맞아 보이니, 스위치 오른쪽 끝과
  `.bar-summary` 왼쪽 끝 사이 간격도 같이 볼 것. 스크린샷은 `PrintWindow`가 오른쪽 영역을
  갱신 안 된 채 찍는 일이 있으니 CDP `Page.captureScreenshot`을 쓸 것.
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
있다 (**폴더 바로 아래** — 하위에 `EisenhowerMatrix/`를 또 만들면 안 읽히고
`migrateLegacyStore()`가 옛 데이터를 끌어온다). GUI 클릭은 좌표로 쏘지 말고 CDP로
`Runtime.evaluate`를 보내 `document.querySelector(...).click()`을 하는 게 확실하다
(Node 22의 전역 `WebSocket`이면 의존성 없이 붙는다). 창 스크린샷은 다른 창에 가려도
`PrintWindow(hwnd, hdc, 2)`로 찍힌다 — `CopyFromScreen`은 검게 나온다.

렌더러·창 동작은 여전히 `npm start`로 직접 띄워서 확인한다. 최소 확인 항목:
할 일 추가 → 완료 → 히스토리에서 되돌리기 → 삭제 → 휴지통에서 복원 → 앱 재시작 후 유지.
