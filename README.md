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
- **RAKKA Rev3**: WebUSB (5249:4C65), 공식 사이트 코드에서 확인한 64바이트 `contact_once` 명령, 키보드/마우스 Keydown·Keyup, 예열·그래프·CSV. 수신 먼저 방식과 요청 기준 미보정 값. 실제 접점 시각에 대한 절대 정확도는 미검증.
- **PTG Studio**: `https://pl.ptgstudio.com/`의 2026-10-15 사용자 HAR 캡처 응답 12개(HTML, JS, CSS, PNG)를 `ptg/` 아래에 보관.
- **Rev3**는 메인 RAKKA 화면에 다시 추가했습니다. 버전 명령(0)으로 연결을 확인하고 접점 명령(2)으로 측정합니다. 기본 접점 측정은 IN 수신을 먼저 등록한 뒤 OUT을 보냅니다.

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
node --check measurement.mjs
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

초기 연결 시 `get_version`을 요청하며, 측정 중에는 `contact_once`만 전송합니다. USB 장치가 응답하지 않으면 2.5초 후 수신 대기를 중단하고 재연결하도록 처리합니다. 사용자 장치의 수신 순서 비교는 조사 기록에 보관했습니다. 실제 접점 시각 기준의 절대 정확도는 검증되지 않았습니다.

상세 규격은 [docs/rev3-protocol.md](docs/rev3-protocol.md)에 기재했습니다. 원본 HAR과 JS는 사용자 로컬에서만 보존하며 이 공개 저장소에는 넣지 않았습니다.


## 현재 Rev3 기본 측정

화면은 연결·측정 설정·Keydown/Keyup 평균·최소/P95/최대·그래프·CSV만 표시합니다. 중간점 추정값과 버전/접점 비교 버튼은 기본 화면에서 제거했습니다.

Rev3는 IN 수신을 먼저 등록한 뒤 기존 64바이트 `contact_once` 요청을 보냅니다. 기본 결과는 다음 **요청 기준 경과시간**입니다.

```text
Keydown = 입력 처리 시각 − OUT 요청 시각
Keyup   = 입력 처리 시각 − OUT 요청 시각 − 요청 유지시간
```

이 값에는 테스터가 접점을 작동시키기까지의 지연 D가 포함됩니다. D는 아직 미확정이며, 0으로 측정된 값이 아닙니다. 키보드만의 지연을 계산하려면 독립적으로 확인한 D를 빼야 합니다. 지금은 임의의 D·USB 응답 대기 절반·절댓값을 적용하지 않습니다. 음수는 표와 그래프에 그대로 표시합니다. Rev1 계산식은 기존 OUT 완료 기준입니다.

Rev3에서 USB 오류·입력 시간 초과·입력 순서 오류가 나면 해당 행을 기록하고 세션을 닫아 추가 접점 명령을 멈춥니다. 성공한 큰 값은 잘라내거나 실패 처리하지 않습니다. 실패 시에도 받은 입력과 USB 시각은 CSV에 남으며 평균에는 포함하지 않습니다. 다시 측정하면 새 연결을 엽니다.

### 기본 CSV

새 CSV의 `keydown_ms`, `keyup_ms`는 화면 값이며 `revision`과 `timing_basis`로 기준을 구분합니다. Rev3는 `out_request`, Rev1은 `out_complete`입니다. `transfer_order`는 Rev3에서 `prearmed`입니다.

원본 OUT 요청/완료·IN 완료·IN 등록·입력 처리·event.timeStamp, 유지시간, IN 기준 참고값, USB 구간, 응답 명령/값, 실패 단계·오류를 별도 컬럼에 기록합니다. 실패나 누락 시각을 0으로 채우지 않습니다. 기존 20/27컬럼 실험 CSV와 새 기본 CSV는 서로 다른 스키마이며 중간점 추정 컬럼은 새 파일에 없습니다. 예전 파일의 의미를 새 기준으로 바꿔 읽지 마세요.

## 지금까지 한 실험과 원본 기록

[Rev3 조사 기록 — 2026-10-29](docs/rev3-investigation-2026-10-29.md)에 음수 문제, 연결 방식·유지시간·이벤트 시각, 버전 통신, USB 엔드포인트 설정, 버전/접점 수신 순서 비교와 남은 과제를 정리했습니다.

원본 CSV 12개와 설명자 JSON 1개는 [실험 파일 폴더](docs/experiments/rev3-2026-10-29/)에 보존했으며 파일 이름 대응과 SHA-256은 [manifest.json](docs/experiments/rev3-2026-10-29/manifest.json)에 있습니다. 실패 행과 튀는 값도 그대로 남겼습니다. 실험용 모듈은 재현용으로 보관하며 기본 화면에는 연결하지 않습니다.

[FUN60 추가 측정 — 2026-10-30](docs/rev3-fun60-2026-10-30.md)에는 새 기본 측정의 50회 성공 결과와 OUT 완료 관측 시간의 영향을 정리했습니다. 요청 기준 평균은 Keydown 5.124ms / Keyup 4.324ms이며 테스터 지연이 포함된 값입니다. [원본 CSV와 해시](docs/experiments/rev3-2026-10-30/)도 별도로 보관했습니다.
