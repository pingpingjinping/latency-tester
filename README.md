# Latency Tester — RAKKA Rev1 + Rev3 + PTG Studio

RAKKA Rev1·Rev3 비공식 오프라인 측정 도구와 사용자 HAR로 추출한 PTG Studio 사이트 스냅샷입니다. RAKKA Rev3 공식 사이트인 https://latency.rakka.dev/ 의 사용자가 직접 보관한 JS/HAR를 분석해 통신 규격을 독립 구현했습니다.

## Windows 실행

1. ZIP 다운로드 및 압축 해제.
2. `start-windows.bat` 실행 (Python 3 또는 Node.js 필요).
3. Chrome/Edge에서 `http://127.0.0.1:8765/` 열기.
4. RAKKA 화면에서 **Rev1 / Rev3 테스터를 선택**하고 연결한 뒤 측정합니다. **PTG Studio 열기** 버튼으로 `/ptg/`에 이동할 수 있습니다.

`py -3 -m http.server 8765 --bind 127.0.0.1` 또는 `node server.mjs`로 직접 실행할 수도 있습니다. WebHID와 JS 모듈을 위해 `file://` 대신 localhost를 권장합니다.

## 기능

- **RAKKA Rev1**: WebHID (5249:4C54), 키보드/마우스 Keydown·Keyup 측정, 예열, 그래프, CSV.
- **RAKKA Rev3**: WebUSB (5249:4C65), 공식 사이트 코드에서 확인한 64바이트 `contact_once` 명령, 키보드/마우스 Keydown·Keyup, 예열·그래프·CSV. **실제 Rev3 하드웨어 실측 검증 필요.**
- **PTG Studio**: `https://pl.ptgstudio.com/`의 2026-10-15 사용자 HAR 캡처 응답 12개(HTML, JS, CSS, PNG)를 `ptg/` 아래에 보관.
- **Rev3**는 메인 RAKKA 화면에 다시 추가했습니다. 이전처럼 명령 없는 수신 대기 대신 공식 코드에서 확인한 OUT→IN 요청/응답 방식입니다.

## PTG 스냅샷의 한계

기본 측정 페이지 JS는 확보되었고 중국어 측정 UI 문구를 한국어로 번역했습니다. 하드웨어 연결·측정은 아직 검증하지 않았습니다.
아래 파일은 HAR에 포함되지 않아 오프라인에서는 관련 메뉴나 그림이 표시되지 않을 수 있습니다.

- 미확보 JS: `index-BHkCQ4M7.js`, `index-BCVNsK7o.js`, `index-DCIBnsKv.js`, `404-BLWz1NYt.js`, `403-BTMoFPF_.js`, `CommonPage-BYKh-44f.js`
- 미확보 이미지: `probe-RiIajV1v.gif`, `pcAccess-U82TlJZr.png`
- 로딩 스타일 `/resource/loading.css`는 두 번째 HAR에서 복구했습니다.

PTG 정적 경로와 Vue Router base를 `/ptg/`로 수정했습니다. 외부 사이트 링크가 남아 있을 수 있으며 다른 메뉴는 완전하지 않습니다. HAR 파일이나 요청 헤더·쿠키는 업로드하지 않았습니다.

## Rev1 / Rev3 안전·검사

Rev1 Feature report ID=0, 8바이트, 첫째 바이트 유지시간(1~200ms), 둘째 바이트 **항상 0** (1은 DFU 명령이라 사용 금지). Rev3는 WinUSB Interrupt OUT/IN 64바이트이며 version(0), contact_once(2) 두 명령만 실행합니다. Rev3 펌웨어 변경·DFU·serial 조회 명령을 제공하지 않습니다. 브라우저/OS 지연이 측정값에 영향을 줄 수 있습니다.

```sh
node --check app.js
node --check protocol.mjs
node --check rev3-protocol.mjs
node --check server.mjs
node --test tests/protocol.test.mjs tests/rev3-protocol.test.mjs
```

## 권리

RAKKA Rev1은 사용자 제공 자료를 바탕으로 새로 작성한 비공식 구현입니다. PTG Studio 원본 코드 및 포함된 라이브러리의 권리는 각 권리자에게 있으며, 본 프로젝트는 공식 배포물이 아닙니다.

## 추가 보강 (2026-10-15)
두 번째 HAR에서 마우스 이미지(`mouse-CdkQfT0w.png`, 628×1150 PNG)와 로딩 CSS를 확보했습니다. PTG 앱과 공통 UI의 중국어 문구 100개 이상을 한국어로 옮겼으며 측정 패킷/연산 코드는 그대로 유지했습니다. 두 화면 상단에 Rev1 ↔ PTG 전환 버튼을 추가했습니다. 하드웨어 실제 측정은 아직 검증되지 않았습니다.

### PTG 마우스 좌/우 버튼 선택 보완
원본은 버튼 클릭 시 `console.log(left/right)`만 수행하고 측정에서 모든 `mousedown/mouseup` 이벤트를 받아들였습니다. 이번 수정은 선택 상태 및 강조 표시를 추가하고 선택된 버튼(왼쪽 0 / 오른쪽 2)의 이벤트만 측정에 포함하도록 변경합니다. 기본 선택은 왼쪽이며 측정 중에는 선택을 변경할 수 없습니다. 하드웨어 측정과 브라우저의 오른쪽 클릭 동작은 실기 검증이 필요합니다.


### PTG 화면 전환 버튼 배치
PTG 화면 위의 별도 전체 너비 전환 바를 제거하고, 기존 흰색 제목줄 오른쪽의 `V1.3` 버전 표시 옆에 작은 `← Rev1` 링크를 배치했습니다. RAKKA Rev1 화면의 PTG 전환 버튼은 유지합니다.


## Rev1 가상 키보드에서 측정 키 선택

기존 측정 키 텍스트 입력 대신 키보드 패널에서 키를 클릭해 고를 수 있습니다. RAKKA 원본의 5열 ANSI 키보드 배열 및 비활성화 키 디자인을 참고한 새 구현이며 외부 UI 라이브러리는 사용하지 않습니다. 기본 키는 A, 선택 가능한 키는 영문·숫자·일부 문장 부호이고 Shift/Ctrl/Enter/Space 등은 원본과 마찬가지로 비활성화되어 있습니다. 측정 도중에는 키 선택을 잠그고, 마우스 모드에서는 키보드 선택 패널을 숨깁니다. 실제 WebHID 패킷과 시간 측정은 변경하지 않았습니다.


### 측정 키 선택 팝업
기존 화면 하단에 항상 표시되던 큼직한 키보드를 제거했습니다. **측정 키** 버튼을 클릭하면 작은 키보드 팝업이 열리고, 키를 클릭하면 값이 저장되면서 자동으로 닫힙니다. Esc·닫기·팝업 바깥 클릭으로도 닫을 수 있습니다. 마우스 모드나 측정 중에는 키 선택을 할 수 없습니다. 측정 자체와 통신 코드에는 변화가 없습니다.


### PL01-1K 참고 자료 / 기술문서 보존

- [PL01 기술문서 한국어 요약과 QQ 캡처 출처](references/pl01/qq-docs/README.md)
- [Gitee 하드웨어·펌웨어 원본 파일 인덱스](references/pl01/gitee/README.md)


## Rev3 복원 근거 (2026-10-17)

사용자가 제공한 https://latency.rakka.dev/ 페이지의 2023년 빌드 파일 `0454688439ab25a701a1.js`, `41742477d8ae3d9c3654.js` 및 HAR에 정상 응답(HTTP 200)이 담겨 있었습니다.

- USB 인터페이스: vendor class `0xFF`, subclass `0x4C`, protocol `0x54`
- USB Interrupt OUT/IN 엔드포인트, 64바이트 패킷
- `get_version` 명령 ID `0`: 64바이트 중 첫 바이트 0
- `contact_once` 명령 ID `2`: 첫 바이트 2, offset 2의 uint32 little-endian에 유지시간(ms)
- 응답 byte 0: 명령 ID, byte 1: 결과 코드(0 성공), offset 2: uint32 데이터
- Rev3 지연 계산 기준점은 **transferIn 응답을 받은 직후**로, Rev1의 Feature Report 전송 완료 직후와 다릅니다.

초기 연결 시 `get_version`을 요청하며, 측정 중에는 `contact_once`만 전송합니다. USB 장치가 응답하지 않으면 2.5초 후 수신 대기를 중단하고 재연결하도록 처리합니다. **Rev3 실기 통과 여부와 공식 사이트 수치 일치 여부는 아직 확인되지 않았습니다.**

상세 규격은 [docs/rev3-protocol.md](docs/rev3-protocol.md)에 기재했습니다. 원본 HAR과 JS는 사용자 로컬에서만 보존하며 이 공개 저장소에는 넣지 않았습니다.


## Rev3 지연시간이 다른 테스터보다 짧아 보이는 이유 (진단)

Rev3 원본 웹사이트는 WebUSB **IN 응답이 끝난 시각**을 기준으로 Keydown/Keyup 지연을 계산합니다. Rev1은 HID 전송 완료 시각을 기준으로 합니다. PTG Studio는 별도 기기와 HID 프로토콜로 이벤트와 USB 명령 왕복 시간의 중간 지점을 이용합니다. 서로 측정 기준이 같지 않아 다른 수치가 나올 수 있습니다.

본 프로젝트는 원본 Rev3 지연 수치를 그대로 표시하면서 다음 추가 항목을 기록합니다.

- OUT 완료 기준 Keydown/Keyup: 같은 키 이벤트 시각에서 WebUSB `transferOut` 완료 시각을 뺀 **참고 수치**.
- USB 응답 대기: `transferIn` 완료 시각에서 `transferOut` 완료 시각을 뺀 시간.
- CSV 추가 컬럼: `rev3_out_keydown_ms`, `rev3_out_keyup_ms`, `rev3_usb_reply_wait_ms`.

수식상 **OUT 기준 지연 = 공식 Rev3 IN 기준 지연 + USB 응답 대기 시간**입니다. 응답 대기 전체가 입력 장치의 실제 레이턴시는 아니며, OUT 기준도 보정된 정답이나 절대 측정값이 아닙니다. 원본과 로컬 측정값 비교는 **동일한 Rev3 기기, 동일한 키/마우스, 동일한 유지 시간·PC 조건**에서 해야 합니다.


## Rev3 중간점 추정치 표시 (2026-10-17)

같은 Rev3 측정에서 FUN60 Ultra는 원본 IN 기준 Keydown 약 -6.89ms, USB 응답 대기 약 15.98ms로 관측됐고, GMK70은 원본 약 2.55ms / USB 응답 대기 약 16.09ms였습니다. 원본 값에 **USB 응답 대기의 절반**을 더하면 각각 약 **1.10ms / 10.60ms**가 되어 사용자가 다른 테스터에서 관측한 대략적 결과와 유사합니다.

이것은 **실제 스위치 접점이 명령과 USB 응답의 정확한 중간 시점에 닫힌다는 증거가 아닙니다.** 과거 `latency.rakka.cn` 사이트가 실제로 다른 계산식을 사용했는지도 미확인입니다.

Rev3 결과 화면에서는 `중간점 추정 (기본)` 또는 `원본 IN 기준`을 선택할 수 있습니다. 이 전환은 **표시만 바꾸며 물리 측정 명령을 바꾸거나 재측정하지 않습니다.** Rev1과 PTG Studio에는 적용하지 않습니다. 원본 데이터는 항상 보존합니다.

- 기존 CSV `keydown_ms`, `keyup_ms`: **원본 IN 기준** (하위 호환 유지)
- 추가 CSV `rev3_midpoint_keydown_est_ms`, `rev3_midpoint_keyup_est_ms`: 회차마다 실제 측정한 USB 응답 대기 시간의 1/2을 더한 추정값
- `rev3_out_keydown_ms`, `rev3_out_keyup_ms`, `rev3_usb_reply_wait_ms`도 그대로 유지

중간점 추정은 실제 지연시간의 확정 보정이 아니며, 특히 Keyup은 보정 후에도 음수가 남을 수 있습니다.
