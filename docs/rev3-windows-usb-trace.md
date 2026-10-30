# Windows USB ETW로 완료 통지 지연 살펴보기

## 이번에 확인할 것

Rev3의 `transferOut()` / `transferIn()` 뒤에 찍은 `performance.now()`는 브라우저 JS가 완료를 관측한 시각입니다. Windows USB 스택의 요청·완료 이벤트와 대조해, 그 사이에 반복되는 지연이 있는지 조사합니다. **실제 접점 닫힘·열림 시각이나 테스터 내부 지연을 직접 측정하는 도구는 아닙니다.** 이번 단계에서는 기존 보정식과 결과 표시를 바꾸지 않습니다.

Windows 기본 `logman`과 `tracerpt`, PowerShell을 사용합니다. 별도 장비·드라이버 설치는 필요 없습니다. 관리자 권한은 ETW 세션을 시작·종료하는 데 필요합니다. 실제 Windows 장치에서의 수집 성공과 전송 이벤트 해석은 첫 로그로 확인해야 합니다.

## 처음에는 FUN60 유선 10회

1. 이 변경이 들어간 ZIP을 새 폴더에 풉니다. 예전 서버 CMD와 측정 탭을 닫고 새 폴더의 `start-windows.bat`를 실행합니다. Chrome/Edge에서 `http://127.0.0.1:8765/`를 열고 Ctrl+F5로 새로고침합니다.
2. Rev3를 연결하고 FUN60을 **유선**, 유지 **20ms**, 간격 **50ms**, 측정 **10회**, 예열 **0회**로 설정합니다. 기준 보정값은 그대로 둡니다. 측정 버튼은 아직 누르지 않습니다.
3. `capture-usb-trace-windows.bat`를 우클릭 → **관리자 권한으로 실행**합니다. `CAPTURING`이 나올 때까지 기다립니다.
4. 브라우저로 돌아와 측정 시작을 누릅니다. 측정 중 다른 입력은 최소화합니다. 완료되면 **CSV 저장**을 누릅니다.
5. 캡처 창으로 돌아와 Enter를 누릅니다. 그대로 두어도 수집은 60초 후 종료됩니다. XML 변환·ZIP 압축은 이후 추가 시간이 걸릴 수 있습니다.
6. `Saved:` 경로의 **ZIP과 같은 실행의 웹 CSV**를 함께 전달합니다. ZIP은 새 폴더의 `usb-traces/rakka-rev3-….zip`에 생깁니다. 측정 실패가 나도 CSV와 ZIP을 남깁니다.

캡처 창은 종료될 때까지 열어 둡니다. 창을 강제로 닫았거나 `active-session.json` 관련 오류가 나면 **같은 폴더**의 `stop-usb-trace-windows.bat`를 관리자 권한으로 실행해 남은 세션을 중지하고 내보냅니다. 정상 캡처와 중지 도구를 동시에 실행하지 마세요. 세션 삭제만 실패한 경우에는 중지 도구를 다시 실행하면 삭제를 재시도합니다.

`No USB3 transfer provider available`이면 `usb-traces` 아래 해당 폴더의 `commands.txt`를 전달합니다. 구형 USB2 전용 컨트롤러의 USBPORT/USBHUB 수집은 이번 스크립트에 포함하지 않았습니다. USB2 장치도 USB3 컨트롤러에 꽂으면 USB3 스택 기록을 사용할 수 있습니다.

## 기록 범위와 파일

USBXHCI·UCX·USBHUB3 중 `(Default,HeadersBusTrace)`로 활성화되는 공급자를 사용합니다. USBXHCI/UCX가 하나도 활성화되지 않으면 수집을 중단합니다. `Default`만으로는 전송 이벤트가 부족하므로 전송 헤더 키워드를 함께 사용합니다. `PartialDataBusTrace`·`FullDataBusTrace`는 사용하지 않습니다.

캡처는 **컨트롤러 전체 USB 메타데이터**를 포함할 수 있습니다. Rev3만 수집하도록 하드웨어 필터를 건 것은 아닙니다. 패킷 내용은 수집하지 않지만 연결된 장치의 식별 정보와 활동 시각 등이 들어갈 수 있으므로 짧은 측정 구간만 기록합니다. 스크립트는 자동 업로드하지 않습니다.

- `usb*.etl`: Windows 원본 추적. 해석이 불완전해도 보존합니다.
- `usb-events.xml`: `tracerpt`의 이벤트 덤프. 원시 타임스탬프 옵션도 켭니다.
- `trace-summary.txt`: 이벤트 손실 등을 확인할 요약.
- `capture.json`: 공급자·키워드·생성 UTC/QPC·대상 VID/PID 정보. QPC 값은 생성 시 참고값이며 웹 시간과 동기화한 값이 아닙니다.
- `commands.txt`, `decode.txt`, `export.json`: 수집/변환 성공 여부.

로그가 크거나 XML 변환에 실패하면 원본 ETL은 폴더에 남습니다. ZIP이 없으면 해당 폴더의 ETL과 위 진단 파일을 전달합니다. 새 세션은 고유 이름을 쓰고, 스크립트가 만든 이름 형식만 중지·삭제합니다. 로컬 추적 폴더는 Git에서 제외했습니다.

## 웹 CSV와 대조하는 방법과 한계

기존 40개 컬럼 뒤에 다음 4개를 추가했습니다. 과거 CSV에는 없으며 빈 값으로 취급합니다. 성공·실패 행 모두 같은 실행의 정보를 복사하고, 결과를 다시 보정해도 이 정보는 유지됩니다.

| 컬럼 | 의미 |
| --- | --- |
| `run_id` | 측정 시작마다 새로 만드는 UUID |
| `time_origin_epoch_ms` | 페이지의 `performance.timeOrigin` |
| `clock_anchor_perf_ms` | 실행 직전의 `performance.now()` |
| `clock_anchor_epoch_ms` | 바로 이어 읽은 `Date.now()` |

대략적인 UTC 위치는 `time_origin_epoch_ms + out_start_at_ms` 등으로 찾습니다. 별도 벽시계 앵커와도 비교해 시계 차이를 점검합니다. 브라우저 시간 정밀도 제한, 두 시계 읽기 사이 간격, 시스템 시간 변경 등이 있으므로 이 매핑만으로 **0.1ms 단위의 정확한 차이를 보장하지 않습니다.** CSV 원본 시각은 브라우저 기준 그대로입니다.

첫 분석에서는 먼저 VID `5249` / PID `4C65`의 장치·엔드포인트와 전송 요청/완료를 식별할 수 있는지, 이벤트 손실이 있는지 확인합니다. 이어 예열 없는 10회 OUT/IN의 순서·간격과 웹 시각을 비교합니다. 패킷 내용이나 회차 ID를 ETW에 넣지 않으므로 시간상 가까운 이벤트를 자동으로 같은 회차라고 단정하지 않습니다. 서로 다른 공급자의 중복 이벤트, IN의 선등록, 연결 시 버전 요청도 구분해야 합니다.

완료 지연이 반복돼 보여도 추적 부하가 생길 수 있으므로, 같은 설정에서 ETW를 끈 새 측정과 비교해야 합니다. 첫 로그 확인 전에는 자동 회차별 보정이나 테스터 지연 산출을 적용하지 않습니다.

## 공식 자료

- [Microsoft: USB 이벤트 추적 수집](https://learn.microsoft.com/en-us/windows-hardware/drivers/usbcon/how-to-capture-a-usb-event-trace) — 관리자 권한, 공급자, 전송 헤더 키워드, USB2/USB3 스택 구분.
- [Microsoft: tracerpt](https://learn.microsoft.com/en-us/windows-server/administration/windows-commands/tracerpt) — ETL → XML, 요약, 원시 타임스탬프 옵션.
- [WebUSB 사양](https://usb.spec.whatwg.org/) — 전송을 비동기로 처리한 뒤 USB 작업을 큐에 넣어 Promise를 완료하는 절차.
