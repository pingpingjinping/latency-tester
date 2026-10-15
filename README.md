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

기본 레이턴시 측정 페이지 JS(`index-B3lzit8o.js`)는 확보되었지만 하드웨어 연결·측정은 검증하지 않았습니다.
아래 파일은 HAR에 포함되지 않아 오프라인에서는 관련 메뉴나 그림이 표시되지 않을 수 있습니다.

- 미확보 JS: `index-BHkCQ4M7.js`, `index-BCVNsK7o.js`, `index-DCIBnsKv.js`, `404-BLWz1NYt.js`, `403-BTMoFPF_.js`, `CommonPage-BYKh-44f.js`
- 미확보 이미지: `probe-RiIajV1v.gif`, `mouse-CdkQfT0w.png`, `pcAccess-U82TlJZr.png`
- 미확보 스타일: `/resource/loading.css` (HTML에서 해당 참조 제외)

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