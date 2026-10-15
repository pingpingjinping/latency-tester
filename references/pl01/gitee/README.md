# Gitee PL01-1K 원본 자료 인덱스

**저장소:** https://gitee.com/opsGoud/latency-tester  
**표시된 기본 브랜치:** `master`  
**2026-10-15 화면상 최근 커밋:** `3359149` (단축 SHA)  
**라이선스:** 원본 저장소에 라이선스가 명시되지 않음

## 원본 파일 목록

| 원본 파일명 | 내용 | 링크 |
| --- | --- | --- |
| `3D_PCB_键盘延迟测试器_REV1.2.step` | PCB 3D STEP 모델 | [원본에서 보기](https://gitee.com/opsGoud/latency-tester/blob/master/3D_PCB_%E9%94%AE%E7%9B%98%E5%BB%B6%E8%BF%9F%E6%B5%8B%E8%AF%95%E5%99%A8_REV1.2.step) |
| `BOM_PCB_键盘延迟测试器_REV1.2.csv` | PCB 부품 목록 | [원본에서 보기](https://gitee.com/opsGoud/latency-tester/blob/master/BOM_PCB_%E9%94%AE%E7%9B%98%E5%BB%B6%E8%BF%9F%E6%B5%8B%E8%AF%95%E5%99%A8_REV1.2.csv) |
| `Gerber_PCB_PL01键盘延迟测试器_REV1.2.zip` | PCB 생산용 Gerber ZIP | [원본에서 보기](https://gitee.com/opsGoud/latency-tester/blob/master/Gerber_PCB_PL01%E9%94%AE%E7%9B%98%E5%BB%B6%E8%BF%9F%E6%B5%8B%E8%AF%95%E5%99%A8_REV1.2.zip) |
| `PLT01_1K_AT32F415_V1.hex` | MCU 펌웨어 | [원본에서 보기](https://gitee.com/opsGoud/latency-tester/blob/master/PLT01_1K_AT32F415_V1.hex) |
| `front.png` | 기판 앞면 | [원본에서 보기](https://gitee.com/opsGoud/latency-tester/blob/master/front.png) |
| `back.png` | 기판 뒷면 | [원본에서 보기](https://gitee.com/opsGoud/latency-tester/blob/master/back.png) |
| `readme.md` | 프로토콜/제품 소개 | [원본에서 보기](https://gitee.com/opsGoud/latency-tester/blob/master/readme.md) |

## 원본 README에 명시된 통신 정보

- PL01-1K / AT32F415 (144MHz)
- USB VID `0xAA96`, PID `0xBB00`
- 누름 명령 `0x0A`: 두 프로브 접점 도통 (원문에는 추가 동작이 없으면 10초 뒤 자동 해제한다고 설명).
- 뗌 명령 `0x0B`: 프로브 접점 개방.
- `0x0C` 등 다른 명령은 **공개 펌웨어용 규약**으로, 공식 제품판에는 적용되지 않는다고 별도로 명시.

**중요:** 공개 DIY판과 공식 양산품의 펌웨어는 다를 수 있습니다. 지금 정상 작동하는 제품의 펌웨어를 확인 없이 덮어쓰지 마세요.

## 파일 보존과 저작권

이 폴더는 **Gitee 원본을 복제한 완전한 미러가 아닙니다.** 출처·파일 목록·링크를 GitHub 안에 기록한 것입니다. Gitee에는 배포 라이선스가 명시되지 않아 STEP·Gerber·HEX·이미지 파일의 공개 GitHub 재배포 권한을 확인할 수 없습니다.

본인 PC에 파일을 보관하려면 Gitee의 Download ZIP 기능을 쓰거나 이 폴더의 `download-original.ps1`을 실행하세요. 업로드/재배포할 때는 원저작자의 허락을 확인해야 합니다.
