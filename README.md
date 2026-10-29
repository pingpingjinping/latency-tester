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
node --check rev3-diagnostics.mjs
node --check usb-descriptors.mjs
node --check server.mjs
node --test tests/*.test.mjs
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

Rev3 결과 화면에서 큰 평균·최소·최대·P95와 회차별 결과는 **중간점 추정값**을 기본으로 보여줍니다. 그 아래 `Rev3 기준점 비교` 영역에는 **원본 IN 기준 Keydown·Keyup 평균을 작은 글씨로 표시**하고, USB 응답 대기 평균·범위 및 OUT 완료 기준값을 함께 표시합니다. Rev1과 PTG Studio에는 적용하지 않습니다. 원본 데이터는 항상 보존합니다.

**매 측정 회차마다** `contact_once`의 `transferOut` 직후와 `transferIn` 완료 시각을 기록해서 각 회차의 OUT→IN 대기시간 절반을 그 회차에만 더합니다. 그 후 성공 회차의 추정값들로 평균·최소·최대·P95를 계산합니다. 고정 +8ms 보정이나 전체 평균값으로 각 회차를 보정하는 방식은 사용하지 않습니다.

- 기존 CSV `keydown_ms`, `keyup_ms`: **원본 IN 기준** (하위 호환 유지)
- 추가 CSV `rev3_midpoint_keydown_est_ms`, `rev3_midpoint_keyup_est_ms`: 회차마다 실제 측정한 USB 응답 대기 시간의 1/2을 더한 추정값
- `rev3_out_keydown_ms`, `rev3_out_keyup_ms`, `rev3_usb_reply_wait_ms`도 그대로 유지

중간점 추정은 실제 지연시간의 확정 보정이 아니며, 특히 Keyup은 보정 후에도 음수가 남을 수 있습니다.

## Rev3 전송 전 시각을 포함한 비교 실험

기존 큰 측정값과 원본 IN 기준값은 그대로 유지하고, `Rev3 기준점 비교`에 새 추정 평균과 회차별 비교표를 추가했습니다.

- `T0`: `transferOut` 호출 직전
- `T1`: `transferOut` 완료 후 (기존 OUT 기준)
- `T2`: `transferIn` 완료 후 (원본 IN 기준)
- 기존 추정: `keydownAt - (T1 + T2) / 2`
- 새 추정: `keydownAt - (T0 + T2) / 2`
- Keyup은 두 식 모두 `keyupAt`을 사용하고 설정한 유지시간을 차감합니다.

새 추정은 기존 추정보다 **해당 회차 OUT 전송 소요시간 `(T1 - T0)`의 절반**만큼 큽니다. OUT 전송 구간까지 포함했을 때 음수 발생과 값의 분포가 어떻게 달라지는지 비교하는 실험입니다. 고정 보정값이나 절댓값을 적용하지 않으며 음수를 그대로 보존합니다. 실제 접점 시각의 정확성이나 음수 해소는 보장하지 않습니다. IN 완료 시각의 흔들림도 여전히 영향을 줍니다.

OUT이 stall로 재전송된 회차는 복구 대기가 섞이므로 새 추정 평균 및 음수 횟수 비교에서 제외하며, 비교표와 CSV에 표시합니다. 기존 추정값은 계속 보존합니다. 새 추정 평균과 음수 횟수 비교는 새 추정이 유효한 동일 회차만 사용합니다.

기존 CSV 9개 컬럼의 순서와 의미는 유지하며 다음 컬럼을 뒤에 추가했습니다.

- `rev3_usb_out_duration_ms`, `rev3_usb_transaction_ms`: `T1-T0`, `T2-T0` (재전송 시 복구 구간도 포함)
- `rev3_transaction_midpoint_keydown_est_ms`, `rev3_transaction_midpoint_keyup_est_ms`: 새 추정값, 재전송 시 빈 칸
- `rev3_out_retried`: OUT 재전송 여부
- `rev3_out_start_at_ms`, `rev3_out_end_at_ms`, `rev3_in_end_at_ms`: `T0`, `T1`, `T2`
- `rev3_keydown_at_ms`, `rev3_keyup_at_ms`, `rev3_hold_ms`: 입력 시각 및 유지시간

시각은 페이지의 `performance.now()` 기준 밀리초이며 날짜·벽시계 시간이 아닙니다. 기존 CSV에는 `T0`가 없으므로 이전 파일로 새 추정값을 복원할 수 없습니다. Rev1의 추가 컬럼은 빈 칸입니다. PTG는 별도 HID 장치에서 누름·뗌 명령을 각각 보내므로, 이번 실험은 PTG의 측정 구조 전체를 이식한 것이 아닙니다.

## 입력 이벤트 시각과 처리 대기 비교

`입력 이벤트 시각 비교`는 기존 OUT 완료~IN 완료 중간점을 유지하고, 입력 시각만 `event.timeStamp`로 바꾸어 나란히 보여줍니다. 기존 큰 결과·원본값·전송 전 기준 비교는 유지합니다.

```text
누름 처리 대기 = keydown 처리 함수의 performance.now() - keydown.timeStamp
뗌 처리 대기   = keyup 처리 함수의 performance.now() - keyup.timeStamp
이벤트 기준 Keydown = keydown.timeStamp - (T1 + T2) / 2
이벤트 기준 Keyup   = keyup.timeStamp - 유지시간 - (T1 + T2) / 2
```

처리 대기 평균·최대와 유효 회차 수, 회차별 기존/이벤트 기준 비교를 표시합니다. 숫자 축소를 정확도 개선으로 단정하지 않습니다. 이벤트 시각은 브라우저가 제공한 입력 시각이며 실제 전기 접점 시각이 아닙니다. USB 기준점의 미확정 문제도 남아 있습니다.

누름과 뗌 모두 같은 `performance.timeOrigin`을 쓰는 유효한 시각이어야 비교에 포함합니다. 누락·0·비수치·처리 시각보다 미래·순서가 뒤집힌 시각은 제외합니다. epoch 시각을 추측해서 변환하거나 처리 시각으로 대체하지 않습니다. 유효하지 않은 경우도 측정 원본과 제공된 이벤트 시각은 보존합니다. 음수·큰 처리 대기값에 절댓값이나 잘라내기를 적용하지 않습니다.

기존 CSV 20개 컬럼 뒤에 다음 7개를 추가합니다. Rev1은 빈 칸입니다.

- `rev3_keydown_event_at_ms`, `rev3_keyup_event_at_ms`: 이벤트 시각 원본
- `rev3_keydown_handler_delay_ms`, `rev3_keyup_handler_delay_ms`: 유효 회차의 처리 대기
- `rev3_event_timestamps_valid`: 이벤트 기준 비교에 사용 가능한지 여부
- `rev3_event_midpoint_keydown_est_ms`, `rev3_event_midpoint_keyup_est_ms`: 기존 중간점을 사용한 이벤트 시각 기준 추정값

기존 CSV에는 이벤트 시각이 없으므로 새 측정이 필요합니다. 비교 시 유지시간·예열·간격·테스터 포트·브라우저를 동일하게 유지하세요.

참고: [Chrome Event.timeStamp 설명](https://developer.chrome.com/blog/high-res-timestamps), [DOM Event.timeStamp 정의](https://dom.spec.whatwg.org/#dom-event-timestamp).

## 접점 동작 없는 버전 조회 통신 검사

Rev3 연결 영역의 **버전 통신 검사 (50회)**를 누르면 기존 `get_version` 명령(0)만 같은 OUT→IN 경로로 반복합니다. 접점 명령은 보내지 않으므로 키보드 연결 방식이나 유지시간을 바꿀 필요가 없습니다. 예열 5회 후 50회, 요청 사이 50ms이며 측정 설정 입력란과 독립적입니다. 새로 연결하면 기존 연결 초기화에서도 버전을 1회 조회하며, 그 응답은 검사 통계에 넣지 않습니다.

- OUT 소요: OUT 호출 직전~완료 후
- 응답 대기: OUT 완료 후~IN 완료 후
- 전체 시간: OUT 호출 직전~IN 완료 후

평균·응답 대기 중간값·범위, 정상/재전송/실패 회차와 개별 시간을 표시합니다. OUT이 재전송된 회차는 통계에서 제외하지만 원본 CSV에는 보존합니다. 예열 또는 측정에 오류가 나면 더 요청하지 않고 부분 결과와 오류를 남깁니다. 중단은 진행 중인 요청의 응답/기존 시간 제한을 기다린 뒤 다음 요청을 보내지 않습니다.

통신 검사·기존 입력 측정·연결 작업은 동시에 실행하지 않습니다. 검사를 실행해도 이전 키보드 측정 결과와 그 CSV는 유지합니다. **통신 CSV 저장**은 별도 `rakka-rev3-version-timing-날짜.csv`를 만듭니다. 명령 ID, 프로토콜 버전, 세 시각과 구간, 재전송 여부, 오류가 들어갑니다. 펌웨어 업데이트·DFU·serial 조회는 추가하지 않습니다.

접점 측정의 약 16ms 응답 대기와 버전 조회의 응답 대기를 비교하기 위한 진단입니다. 두 값이 같아도 실제 접점 시각이나 왕복의 정확한 중간점이 증명되는 것은 아닙니다. 두 값을 빼서 키보드 레이턴시의 확정 보정값으로 사용하지 않습니다.

## USB 엔드포인트 주기 설정 읽기

**USB 주기 설정 읽기**는 현재 Rev3 구성의 표준 Configuration Descriptor를 읽어, 사용 중인 인터페이스의 IN/OUT 주소·전송 종류·패킷 크기·`bInterval` 원본값을 표시합니다. 선택한 구성의 descriptor index를 찾아 헤더 9바이트와 전체 설명자를 순서대로 요청합니다. 구성 값이 descriptor index와 같다고 가정하지 않습니다.

요청은 `controlTransferIn`의 표준 `GET_DESCRIPTOR`(6), descriptor type Configuration(2), recipient Device만 사용합니다. 접점 명령이나 control OUT, 구성 변경, 펌웨어·DFU·serial 조회는 추가하지 않습니다. 처음 연결할 때 기존 연결 초기화의 버전 조회는 실행될 수 있습니다. 기존 측정/통신 검사와 동시에 읽지 않습니다.

`bInterval`은 원본 필드이며 숫자 자체를 ms로 확정하지 않습니다. 실제 주기는 장치 연결 속도와 호스트에 따라 달라집니다. USB 버전 지원 여부와 실제 연결 속도도 같은 의미가 아니므로 결과의 `negotiatedSpeed`는 `unknown`으로 남깁니다.

**설정 JSON 저장**으로 `rakka-rev3-usb-descriptors.json`을 저장하세요. 선택한 인터페이스뿐 아니라 구성 설명자 원본 바이트(hex), 해석한 인터페이스 목록, 요청 index/길이도 포함합니다. 읽기가 거부되거나 설명자가 잘못되면 성공처럼 표시하지 않고 실패 이유와 받은 원본을 저장할 수 있습니다. 시간 초과 시 진행 중인 요청을 개별 취소할 수 없어 세션을 닫고 재연결하도록 합니다.

참고: [WebUSB controlTransferIn](https://wicg.github.io/webusb/#dom-usbdevice-controltransferin), [Microsoft USB_ENDPOINT_DESCRIPTOR / bInterval](https://learn.microsoft.com/en-us/windows-hardware/drivers/ddi/usbspec/ns-usbspec-_usb_endpoint_descriptor).

## 버전 조회 수신 순서 비교

**수신 순서 비교 (각 50회)**는 기존 OUT 완료 후 IN을 요청하는 방식과, IN 수신을 먼저 요청한 뒤 OUT을 보내는 방식을 비교합니다. 두 방식 모두 버전 명령 0만 사용합니다. 키보드 접점 측정의 요청 순서·계산식은 바꾸지 않습니다.

각 방식 5회 예열 후 각 50회 측정하고, 쌍마다 AB/BA 순서를 교대해 어느 방식을 먼저 검사하는지 균형을 맞춥니다. 요청 간격은 50ms입니다. 정상적으로 양쪽 방식이 완료되고 재전송이 없었던 동일 쌍만 요약에 포함합니다. 중단·오류·재전송·짝이 없는 행도 CSV에는 보존합니다.

수신 먼저 방식은 IN/OUT 각각의 Promise 완료 콜백에서 시각을 기록합니다. OUT을 기다린 뒤 IN 완료 시각을 찍지 않습니다. 오류나 시간 초과 시 세션을 닫고 추가 요청을 중단하며, 실패한 OUT을 수신 대기가 남은 상태에서 재전송하지 않습니다.

- `reply_wait_ms`: IN 완료−OUT 완료. 수신 먼저 방식에서 음수가 될 수 있으며 절댓값이나 잘라내기를 하지 않습니다.
- `in_elapsed_ms`: OUT 시작→IN 완료.
- `total_ms`: OUT 시작→IN·OUT 양쪽 완료. 수신이 먼저 끝나도 OUT 완료를 포함합니다. 기존 순차 방식에서는 이전 의미와 같습니다.
- `in_submitted_at_ms`: 수신 먼저 방식의 IN 요청 직전 시각. 기존 방식은 별도로 기록하지 않아 빈 칸입니다.

통신 CSV의 기존 13개 컬럼 뒤에 `mode`, `pair`, `in_submitted_at_ms`, `in_elapsed_ms`, `in_before_out_complete`를 추가합니다. 파일명은 비교 시 `rakka-rev3-version-order-날짜.csv`입니다. `mode`는 `sequential`(기존) 또는 `prearmed`(수신 먼저)입니다.

수신 먼저 방식의 IN−OUT 완료 차이만 줄었다고 키보드 지연이나 절대 정확도가 개선됐다는 뜻은 아닙니다. IN 완료까지의 시간과 양쪽 완료까지의 시간, 동일 쌍의 차이를 함께 봐야 합니다. 장치 응답에 회차 식별자가 없어 IN이 먼저 완료될 때 이전 응답과 이번 요청의 응답을 시각만으로 구분할 수 없습니다. 외부 프로그램이나 다른 탭을 함께 연결하지 마세요.
