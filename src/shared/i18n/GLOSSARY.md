# 용어 사전

같은 한국어가 파일마다 다른 영어로 나가는 것을 막기 위한 표다. **새 문자열을 넣기 전에
여기부터 본다.** 여기 없는 용어를 새로 정하면 이 표에 한 줄 추가한다.

| 한국어 | English | 메모 |
| --- | --- | --- |
| 할 일 | task | `to-do`로 쓰지 않는다 |
| 다 꺼내기 | Brain dump | 인박스가 아니다. 코드의 `INBOX`는 내부 이름일 뿐이고, 화면에 보이는 이름은 "일단 전부 쏟아낸다"는 뜻을 살린다 |
| 분면 | quadrant | |
| 업무 / 일상 | Work / Life | 타이틀바 토글 |
| 히스토리 | History | 완료된 할 일 |
| 휴지통 | Trash | |
| 메모 | note | `memo`는 코드에서만 |
| 마감일 | due date | 칩 안에서는 `Due` |
| 바 모드 / 확장 모드 | bar mode / expanded mode | |
| 항상 위에 고정 | Always on top | |
| 기기 간 동기화 | Sync across devices | 짧게 쓸 자리에서는 `Sync` |
| 내보내기 | Export | |
| 설정 | Settings | |
| 회원탈퇴 | Delete account | `Withdraw`·`Unsubscribe`가 아니다 |
| 로그인 / 로그아웃 | Sign in / Sign out | `Log in`이 아니다 — Google 버튼 문구와 맞춘다 |

## 문장 규칙

- **한국어는 존댓말**, 영어는 평서문. 영어를 한국어 문장 구조로 옮기지 않는다.
- 오류 문구는 **무엇이 잘못됐고 어떻게 하면 되는지**를 말한다. 사과하지 않는다.
- 버튼은 **일어날 일**을 그대로 적는다 (`Publish` → 눌렀으면 `Published`).
- 숫자가 들어가는 문장은 보간을 쓴다: `"대기 {{count}}개"` / `"{{count}} waiting"`.
  영어 복수형이 필요하면 i18next의 `_one`/`_other`를 쓰고, 직접 `s`를 붙이지 않는다.

## 키 이름 규칙

화면의 영역을 앞에 둔다 — `account.*`, `settings.*`, `matrix.*`, `inbox.*`, `archive.*`,
`memo.*`, `titlebar.*`, `welcome.*`, `export.*`, `due.*`. 영어 문장을 키로 쓰지 않는다:
문구를 다듬을 때마다 키가 바뀐다.
