# RAKKA Rev3 실장치 조사 — 2026-10-15

Windows에 연결한 `5249:4C65` 장치에서 확인한 기록이다. **Rev3 측정 명령은 아직 미확인**이다. USB 전송 성공, A/B 접점 출력 작동, 키 입력, 지연시간 측정 성공은 각각 구분해야 한다.

이 저장소의 웹앱은 Rev3 OUT 명령을 보내지 않는다. 아래 쓰기 시험은 웹앱 외부의 Windows WinUSB 진단 스크립트에서 사용자의 사전 승인을 각각 받아 수행했다. 미확인 opcode 탐색이나 패딩 길이 변경을 반복하지 않았다. DFU 진입, 펌웨어 변경, 초기화, USB reset, clear-halt 명령은 실행하지 않았다.

## 직접 읽은 USB 정보

| 항목 | 확인값 |
| --- | --- |
| 제조사 / 제품 | `RAKKA` / `LatencyTester` |
| Windows 드라이버 | Microsoft WinUSB, `winusb.inf`, `10.0.26100.9549` |
| 실제 연결 속도 | Full Speed, 12 Mbps |
| `bcdUSB` / `bcdDevice` | `0x0210` / `0x0002` |
| EP0 최대 패킷 크기 | 64바이트 |
| configuration | 활성 값 1, 인터페이스 1개 |
| interface / alternate | 0 / 0 |
| class / subclass / protocol | `FF / 4C / 54` |
| IN endpoint | `0x81`, Interrupt, 최대 64바이트, `bInterval=8` |
| OUT endpoint | `0x01`, Interrupt, 최대 64바이트, `bInterval=8` |
| 전원 선언 | Bus powered, 최대 500mA 선언값 |
| serial 문자열 | `iSerialNumber=0` |

`bcdDevice=0x0002`를 하드웨어 Rev2 또는 측정 프로토콜 버전 2로 해석하지 않는다. Full Speed Interrupt의 `bInterval=8`은 8ms 서비스 간격을 나타내며 키보드 지연시간 측정값이 아니다. 최대 패킷 크기 64바이트만으로 응용 명령 길이가 64바이트라고 단정할 수 없다. 실제 소비전력은 측정하지 않았다.

원시 디스크립터:

```text
Device (18 bytes):
12011002000000404952654C020001020001

Configuration (32 bytes):
0902200001010280FA0904000002FF4C54020705810340000807050103400008

BOS (57 bytes):
050F3900021810050038B60834A909A0478BFDA0768815B665000101001C100500DF60DDD88945C74C9CD2659D9E648A9F00000306A2001700
```

디스크립터 길이·경계·인터페이스 수·엔드포인트 수를 오프라인 파서로 검사했다. Configuration의 엔드포인트 디스크립터는 Windows 허브 조회의 open-pipe 정보와 일치했다.

BOS에는 WebUSB 1.00과 Microsoft OS 2.0 platform capability가 있다. WebUSB vendor code는 `0x01`, `iLandingPage=0`이다. Microsoft OS 2.0 descriptor set 길이는 162바이트, vendor code는 `0x17`, alternate enumeration code는 0이다. **이 코드는 디스크립터 조회용 메타데이터이며 측정 opcode의 증거가 아니다.** 해당 vendor request를 시험 전송하지 않았다.

## Rev1과 비교

| 항목 | 확보된 Rev1 원본 | 현재 Rev3 장치 |
| --- | --- | --- |
| USB ID | `5249:4C54` | `5249:4C65` |
| 전송 경로 | WebHID Feature Report | Vendor interface의 Interrupt IN/OUT |
| 측정 요청 | `sendFeatureReport(0, payload)` | 미확인 |
| 응답 조회 | `receiveFeatureReport(0)` | 응답 형식·조회 순서 미확인 |
| payload | 8바이트, 첫 바이트 유지 시간, 둘째 바이트 0 | Rev1 payload 그대로의 호환성 미확인 |
| A/B 출력과 PC 입력의 관계 | 명령 후 키 이벤트를 기록하는 원본 로직 | 아래 시험에서 작동 미확인 |

Rev1 원본에서는 둘째 바이트 1이 DFU 진입 경로다. 원본의 report ID 0은 WebHID API 인수이며, 아래 Interrupt OUT 시험의 payload 앞에 별도 바이트로 붙이지 않았다. 서로 다른 전송 경로라는 사실만으로 payload가 다르다고 단정할 수 없고, 같은 payload가 동작한다고 단정할 수도 없다.

사용자가 보존한 Rev1 `script.js`의 SHA-256:

```text
0455960B7299F5DFA8D1A3886A31B227FA972AE6358D4C86451049C0A59B66C9
```

원본 스크립트나 펌웨어는 이 기록에 포함하지 않는다.

## 읽기 전용 관찰

명령 전송 전 IN `0x81`을 최대 64바이트씩 3회 조회했다. 각각 500ms 시간 초과(Windows 오류 121), 수신 0바이트였다. 해당 관찰 구간에서 자발적 데이터는 없었으며, 이것만으로 장치 고장이나 프로토콜 오류를 판정할 수 없다.

WinUSB 핸들을 열 때 읽기/쓰기 접근 권한이 필요했지만, 핸들 접근 권한 자체는 USB OUT payload 전송을 뜻하지 않는다. `WinUsb_Initialize`와 호스트 파이프 timeout 설정을 사용했다. 자동 clear-stall 및 resume reset 정책이 비활성인지 확인했으며, 장치 reset이나 복구 명령은 호출하지 않았다.

## 별도 승인된 단발 호환 시험

세 번 모두 같은 payload `0A 00 00 00 00 00 00 00`을 OUT `0x01`로 한 번만 호출했다. 이는 **Rev1에서** 유지 시간 10ms와 DFU flag 0을 뜻한다. Rev3에서의 의미는 미확인이다. 자동 재시도와 64바이트 패딩은 없었다. OUT 성공 및 8바이트 전송이 보고된 경우에만 IN `0x81`을 최대 64바이트, timeout 500ms로 한 번 읽었다.

시간은 2026-10-15 한국 표준시(KST)다.

| 시험 | 연결 조건 | OUT 호스트 결과 | IN 결과 | 키 관찰 |
| --- | --- | --- | --- | --- |
| 18:23 | USB-C 연결, 키보드 접점 쪽은 분리 | 성공, 8바이트 | 오류 121, 0바이트 | 1 입력 변화 없음; 접점 분리로 호환성 판단 불가 |
| 18:29 | 키보드 1 접점 연결, 첫 시험 이후 USB-C 전원 유지 | 오류 121, 0바이트 보고 | 수행 안 함 | 1 입력 변화 없음; OUT 성공 전제 미충족 |
| 18:44 | 사용자가 USB-C를 뺐다 다시 연결, 키보드 1 접점 연결 | 성공, 8바이트 | 오류 121, 0바이트 | 짧은 상태 관찰에서 1 입력 변화 없음 |

총 application OUT 호출은 3회다. 시간 초과의 0바이트 보고만으로 장치가 버스에서 어떤 데이터도 보지 않았다고 보장하지 않는다. OUT API 소요 시간 약 5.18ms / 501.28ms / 1.25ms는 키보드 지연시간이 아니다.

키 관찰은 상단 숫자 1(`VK 0x31`)만 대상으로 했다. 마지막 시험의 약 2ms 주기 polling은 짧은 입력을 놓칠 수 있으며 정밀 지연시간 측정이 아니다. 사용자는 마지막 시험 때 메모장에 입력 초점이 없어서 화면의 입력 여부를 확인하지 못했다. 이를 화면에서도 입력이 없었다는 관찰로 기록하지 않는다.

시험 후 Windows PnP 상태는 OK였다. 두 번째 및 세 번째 시험 후 표준 IN `GET_STATUS`(`bmRequestType=0x82`, `bRequest=0`, `wValue=0`, 각 endpoint index, `wLength=2`)는 양쪽 endpoint에서 `00 00`, HALT 비활성을 반환했다. HALT가 없다는 것이 다음 OUT을 처리할 준비가 됐다는 뜻은 아니다.

## A/B 접점과 하드웨어 관찰

사용자 설명에 따르면 하단 A/B를 키보드 1 키 스위치의 두 접점에 연결하고, 테스터가 A/B 사이를 연결·분리해 입력을 발생시키는 방식이다. 사용자는 스위치 접점을 수동 연결·분리하면 1이 입력된다고 확인했다. 이는 해당 접점에서 PC까지의 입력 경로에 대한 대조 관찰이며, Rev3 출력 소자가 명령으로 작동했다는 증거는 아니다.

사진에서는 WCH `CH32V203C8T6` MCU와 `EL817` 부품 표기를 읽었다. 사진만으로 전체 회로, A/B 극성 또는 GPIO 매핑을 확정하지 않았다. 연결 상태에서 A/B DC 전압이 계속 변한다는 사용자 관찰은 수치·범위가 확보되지 않아 출력 동작 판정에 사용하지 않는다. 멀티미터를 이용한 출력 확인은 중단했다.

## 현재 결론과 필요한 검증

- Rev3의 실제 USB 전송 경로와 디스크립터는 확인했다.
- 같은 Rev1 8바이트 payload는 새 전원 상태에서 전송에 성공했지만, A/B 작동·키 입력·측정 응답을 확인하지 못했다.
- 첫 패킷 이후의 전원 유지 상태만으로 모든 무응답을 설명할 수는 없다. 프레임 길이, 명령 형식, 선행 절차, 출력 회로/연결 상태 중 어느 원인인지 구분되지 않았다.
- 추가 명령을 구현하려면 Rev3의 명령 형식에 대한 근거와, 명령 후 A/B 출력 및 PC 입력이 재현된다는 검증이 필요하다. 엔드포인트 최대 크기나 BOS vendor code를 측정 명령으로 추측해 전송해서는 안 된다.
- 이 기록은 진단 결과이며 Rev3 측정 기능 구현 완료나 기기 고장 판정이 아니다. 새로운 USB 쓰기 시험에는 별도 사전 승인이 필요하다.

참고: [Microsoft WinUsb_WritePipe](https://learn.microsoft.com/en-us/windows/win32/api/winusb/nf-winusb-winusb_writepipe), [USB control transfers와 GET_STATUS](https://learn.microsoft.com/en-us/windows-hardware/drivers/usbcon/usb-control-transfer).
