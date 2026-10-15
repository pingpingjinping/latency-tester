# Latency Tester — RAKKA Rev1 + PTG Studio

RAKKA Rev1 비공식 로컬 측정 도구와 사용자 HAR로 추출한 PTG Studio 사이트 스냅샷입니다.

## Windows 실행

1. ZIP 다운로드 및 압축 해제.
2. `start-windows.bat` 실행 (Python 3 또는 Node.js 필요).
3. Chrome/Edge에서 `http://127.0.0.1:8765/` 열기.
4. Rev1은 첫 화면에서 측정하고, **PTG Studio 열기** 버튼으로 `/ptg/`에 이동합니다.

`py -3 -m http.server 8765 --bind 127.0.0.1` 또는 `node server.mjs`로 직접 실행할 수도 있습니다. WebHID와 JS 모듈을 위해 `file://` 대신 localhost를 권장합니다.

## 기능

- **RAKKA Rev1**: WebHID (5249:4C54), 키보드/마우스 Keydown·Keyup 측정, 예열, 그래프, CSV. 하드웨어 실기 최종 검증 필요.
- **PTG Studio**: `https://pl.ptgstudio.com/`의 2026-10-15 사용자 HAR 캡처 응답 12개(HTML, JS, CSS, PNG)를 `ptg/` 아래에 보관.
- **Rev3**: 관련 화면과 진단 코드는 이번 버전에서 제거.

## PTG 스냅샷의 한계

기본 측정 페이지 JS는 확보되었고 중국어 측정 UI 문구를 한국어로 번역했습니다. 하드웨어 연결·측정은 아직 검증하지 않았습니다.
아래 파일은 HAR에 포함되지 않아 오프라인에서는 관련 메뉴나 그림이 표시되지 않을 수 있습니다.

- 미확보 JS: `index-BHkCQ4M7.js`, `index-BCVNsK7o.js`, `index-DCIBnsKv.js`, `404-BLWz1NYt.js`, `403-BTMoFPF_.js`, `CommonPage-BYKh-44f.js`
- 미확보 이미지: `probe-RiIajV1v.gif`, `pcAccess-U82TlJZr.png`
- 로딩 스타일 `/resource/loading.css`는 두 번째 HAR에서 복구했습니다.

PTG 정적 경로와 Vue Router base를 `/ptg/`로 수정했습니다. 외부 사이트 링크가 남아 있을 수 있으며 다른 메뉴는 완전하지 않습니다. HAR 파일이나 요청 헤더·쿠키는 업로드하지 않았습니다.

## Rev1 안전·검사

Rev1 Feature report ID=0, 8바이트, 첫째 바이트 유지시간(1~200ms), 둘째 바이트 **항상 0** (1은 DFU 명령이라 사용 금지). 브라우저/OS 지연이 측정값에 영향을 줄 수 있습니다.

```sh
node --check app.js
node --check protocol.mjs
node --check server.mjs
node --test tests/protocol.test.mjs
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
