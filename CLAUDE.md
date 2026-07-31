# EisenhowerMatrix — 에이전트용 프로젝트 노트

아이젠하워 매트릭스 데스크톱 위젯. Electron 43, 빌드는 electron-builder.
**사용자 대상 기능 설명은 `README.md`에 있음. 이 파일은 중복하지 않고, 코드를 읽어서는 알기 어려운 것만 적는다.**

## 아키텍처 한 줄 요약

```
src/main.js       메인 프로세스 — 창 모드(expanded/collapsed), data.json 저장, IPC handle
src/preload.js    contextBridge → window.api (여기 없는 건 렌더러에서 못 씀)
src/shared/
  core.js         날짜·정규화·레이아웃 비율 등 순수 로직. 메인·렌더러·테스트가 공유
  store-io.js     data.json 읽기/쓰기 (electron 의존 없음 — 경로는 호출자가 준다)
src/renderer/
  index.html      4분면 + 히스토리/휴지통/가이드 탭의 정적 마크업
  renderer.js     전역 tasks 배열 하나가 유일한 상태. 모든 변경 → save() → render()
  styles.css      data-theme="light|dark" 로 팔레트 전환
test/             node --test 용 단위 테스트 (shared/ 만 커버)
```

**`src/shared/core.js`는 두 가지 방식으로 로드된다**: 메인·테스트는 `require`, 렌더러는
`<script>` 태그(renderer.js보다 먼저). 그래서 이 파일은 Node·DOM API를 쓰면 안 되고,
**renderer.js에서 같은 이름을 다시 `const`로 선언하면 SyntaxError가 난다.**

## 반드시 지켜야 할 것 (어기면 데이터가 날아감)

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
- IPC를 새로 추가할 때는 **세 곳을 모두** 건드려야 한다: `main.js`의 `ipcMain.handle`,
  `preload.js`의 `exposeInMainWorld`, 렌더러의 `window.api.*` 호출.

## 알아두면 좋은 것

- `app.setName('EisenhowerMatrix')`가 `main.js` 최상단에 있는 이유: `npm start`와 패키징된
  exe가 **같은** `%APPDATA%\EisenhowerMatrix\data.json`을 보게 하려고. 지우면 개발용/배포용
  데이터가 갈라진다. `migrateLegacyStore()`는 이 이름을 고정하기 전 데이터를 옮겨오는 코드다.
- 창 위치(`bounds`)는 **expanded 모드일 때만** 저장한다 (`rememberBounds`). 바 모드 크기가
  저장돼버리면 다음 실행 때 440×48로 열린다.
- 분면 비율 `layout.cols/rows`는 0.15~0.85로 클램프된다. 상수와 클램프 함수는
  `shared/core.js` 한 곳에만 있고 main·renderer가 그걸 부른다.
- 그리드 간격(`GUTTER`)은 CSS `--gutter`를 `getComputedStyle`로 읽어온다. 값을 바꿀 곳은
  `styles.css` 하나뿐이다.
- **마감일 표시는 "오늘" 기준이라 시간이 지나면 틀려진다.** renderer.js의
  `scheduleDayRollover()`가 자정에 재렌더하고, 포커스 복귀·visibilitychange에서도
  날짜가 바뀌었으면 다시 그린다 (절전에서 깨어난 경우 대비).
- 메인이 보내는 `win:mode` 푸시는 렌더러의 `onMode` 등록보다 먼저 도착할 수 있다. 그래서
  등록은 `init()`의 **첫 await 이전**에 하고, `state:load`가 준 `mode`보다 푸시된 값을
  우선한다. 이 순서를 바꾸면 "창은 바 모드인데 내용은 확장 레이아웃"이 가끔 재현된다.
- 단일 인스턴스 락이 걸려 있어서, **앱이 이미 떠 있으면 `npm start`가 조용히 죽는다.**
  실행이 안 되는 것처럼 보이면 먼저 기존 프로세스를 확인할 것.

## 작업 규칙

- 코드 주석/커밋 메시지는 영어, 사용자 대화와 문서는 한국어.
- 기능을 바꾸면 `README.md`의 해당 섹션도 같이 고친다.
- 되돌리기 어려운 결정을 내렸으면 `docs/DECISIONS.md`에 한 줄 남긴다.
- **작업을 마칠 때마다 커밋한다.** 컨텍스트가 날아가도 커밋 로그가 남으면 복구된다.

## 검증

`npm test` (`node --test`, 추가 의존성 없음) 가 `src/shared/`의 순수 함수만 덮는다 —
데이터가 날아가는 규칙(정규화 기본값, quadrant 유효성, temp+rename 저장, 손상 파일 폴백)이
여기 들어 있으니 이 파일들을 건드렸으면 반드시 돌린다. UI는 커버되지 않는다.

렌더러·창 동작은 여전히 `npm start`로 직접 띄워서 확인한다. 최소 확인 항목:
할 일 추가 → 완료 → 히스토리에서 되돌리기 → 삭제 → 휴지통에서 복원 → 앱 재시작 후 유지.
