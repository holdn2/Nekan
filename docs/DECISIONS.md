# 결정 기록

되돌리기 어려운 선택과 그 이유만 적는다. 진행 상황이나 할 일 목록은 여기 적지 않는다.
새 세션의 Claude가 "왜 이렇게 돼 있지?"라고 물을 만한 것만 남긴다.

형식: `## YYYY-MM-DD — 제목` → 결정 / 이유 / 대안(왜 안 골랐는지)

---

## 2026-07-31 — task를 배열에서 지우지 않고 타임스탬프로 상태 표현

**결정** `completedAt` / `deletedAt` 두 필드의 null 여부로 활성·완료·휴지통을 구분한다.
별도의 `history[]`, `trash[]` 배열을 두지 않는다.

**이유** 되돌리기(완료 취소, 휴지통 복원)를 할 때 원래 분면·순서 정보를 잃지 않는다.
배열을 옮기는 방식이면 복원 시점에 원래 위치를 따로 기억해야 한다.

**대가** 모든 조회에 필터가 붙는다 (`activeOf`, `doneTasks`, `trashedTasks`).
할 일이 수천 개가 되면 재검토할 것.

## 2026-07-31 — 저장을 temp write + rename으로

**결정** `data.json`을 직접 쓰지 않고 `data.json.tmp`에 쓴 뒤 `renameSync`.

**이유** rename은 원자적이라, 저장 중에 앱이 죽어도 반쪽짜리 JSON이 남지 않는다.
직접 쓰다 끊기면 `JSON.parse` 실패 → `defaultStore()` 반환 → **전체 할 일 소실**이다.

## 2026-07-31 — 앱 이름을 코드에서 고정

**결정** `main.js` 최상단 `app.setName('EisenhowerMatrix')`.

**이유** 이게 없으면 `npm start`는 `package.json`의 `eisenhower-matrix`를,
패키징된 exe는 `productName`인 `EisenhowerMatrix`를 써서 데이터 폴더가 갈라진다.
이미 갈라진 사용자를 위해 `migrateLegacyStore()`가 소문자 폴더에서 한 번 복사해온다.
