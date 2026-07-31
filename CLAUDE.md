# EisenhowerMatrix — 에이전트용 프로젝트 노트

아이젠하워 매트릭스 데스크톱 위젯. Electron 33, 빌드는 electron-builder.
**사용자 대상 기능 설명은 `README.md`에 있음. 이 파일은 중복하지 않고, 코드를 읽어서는 알기 어려운 것만 적는다.**

## 아키텍처 한 줄 요약

```
src/main.js       메인 프로세스 — 창 모드(expanded/collapsed), data.json 저장, IPC handle
src/preload.js    contextBridge → window.api (여기 없는 건 렌더러에서 못 씀)
src/renderer/
  index.html      4분면 + 히스토리/휴지통/가이드 탭의 정적 마크업
  renderer.js     전역 tasks 배열 하나가 유일한 상태. 모든 변경 → save() → render()
  styles.css      data-theme="light|dark" 로 팔레트 전환
```

## 반드시 지켜야 할 것 (어기면 데이터가 날아감)

- **task는 절대 배열에서 지우지 않는다.** 상태는 세 개의 타임스탬프 필드로만 표현한다:
  - 활성: `completedAt === null && deletedAt === null`
  - 완료(히스토리): `completedAt !== null`
  - 휴지통: `deletedAt !== null`
  - 실제 `filter`로 제거하는 곳은 `purgeTask()` (영구 삭제) 단 하나뿐이다.
- **task 스키마에 필드를 추가하면 기존 `data.json`에는 그 필드가 없다.** `renderer.js`의
  `normalize()`에서 기본값을 채워줘야 한다. 마이그레이션 코드 없이 필드를 읽으면 기존 사용자
  데이터에서 `undefined`가 된다.
- **저장은 temp write + rename** (`main.js` `writeStore`). 이 패턴을 단순 `writeFileSync`로
  바꾸지 말 것 — 쓰다 끊기면 전체 할 일이 사라진다.
- IPC를 새로 추가할 때는 **세 곳을 모두** 건드려야 한다: `main.js`의 `ipcMain.handle`,
  `preload.js`의 `exposeInMainWorld`, 렌더러의 `window.api.*` 호출.

## 알아두면 좋은 것

- `app.setName('EisenhowerMatrix')`가 `main.js` 최상단에 있는 이유: `npm start`와 패키징된
  exe가 **같은** `%APPDATA%\EisenhowerMatrix\data.json`을 보게 하려고. 지우면 개발용/배포용
  데이터가 갈라진다. `migrateLegacyStore()`는 이 이름을 고정하기 전 데이터를 옮겨오는 코드다.
- 창 위치(`bounds`)는 **expanded 모드일 때만** 저장한다 (`rememberBounds`). 바 모드 크기가
  저장돼버리면 다음 실행 때 440×48로 열린다.
- 분면 비율 `layout.cols/rows`는 0.15~0.85로 클램프된다 (main·renderer 양쪽에서).
- 단일 인스턴스 락이 걸려 있어서, **앱이 이미 떠 있으면 `npm start`가 조용히 죽는다.**
  실행이 안 되는 것처럼 보이면 먼저 기존 프로세스를 확인할 것.

## 작업 규칙

- 코드 주석/커밋 메시지는 영어, 사용자 대화와 문서는 한국어.
- 기능을 바꾸면 `README.md`의 해당 섹션도 같이 고친다.
- 되돌리기 어려운 결정을 내렸으면 `docs/DECISIONS.md`에 한 줄 남긴다.
- **작업을 마칠 때마다 커밋한다.** 컨텍스트가 날아가도 커밋 로그가 남으면 복구된다.

## 검증

자동 테스트는 없다. 변경 후 `npm start`로 직접 띄워서 확인한다. 최소 확인 항목:
할 일 추가 → 완료 → 히스토리에서 되돌리기 → 삭제 → 휴지통에서 복원 → 앱 재시작 후 유지.
