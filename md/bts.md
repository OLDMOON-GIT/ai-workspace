# Bug Tracking System (BTS)

## 우선순위
- 🔴 **CRITICAL**: 시스템 완전 불가, 블로커
- 🟠 **MAJOR**: 주요 기능 장애
- 🟡 **MINOR**: 부분적 문제
- ⚪ **TRIVIAL**: 사소한 문제

## 목록
- 🟡 [BTS-0000041: 제목 추가 시 잘못된 탭 포커싱](bts/BTS-0000041.md) ✅
- 🔴 [BTS-0000040: 상품 YouTube 설명/댓글 여전히 업로드 안 됨 (BTS-0000039 재발)](bts/BTS-0000040.md) 🔄
- 🔴 [BTS-0000039: 상품/숏폼 YouTube 업로드 로직 미작동](bts/BTS-0000039.md) 🔄
- 🔴 [BTS-0000038: AI 생성 대본 narration 품질 저하 (오타, 의미 불명 문장)](bts/BTS-0000038.md) ✅
- 🟡 [BTS-0000037: 크롤링 이미지 UI가 잘못된 데이터로 표시됨 (0/0, Scene undefined)](bts/BTS-0000037.md) ✅
- 🟡 [BTS-0000036: 이미지 크롤링 사용 시 dalle3 로그가 출력되어 헷갈림](bts/BTS-0000036.md) ✅
- 🔴 [BTS-0000035: AI 생성 대본 narration에 글자수 카운트 포함됨](bts/BTS-0000035.md) ✅
- 🟠 [BTS-0000034: Flow 이미지 생성 모드 추가](bts/BTS-0000034.md) 🔄
- 🔴 [BTS-0000033: 재시도 버튼 클릭 시 type/status 업데이트 안 됨](bts/BTS-0000033.md) ✅
- 🟠 [BTS-0000032: Next.js 빌드 캐시 손상으로 서버 시작 실패](bts/BTS-0000032.md) ✅
- 🟠 [BTS-0000031: 스케줄 시간이 과거로 설정되어 즉시 실행됨](bts/BTS-0000031.md) ✅
- 🟠 [BTS-0000030: YouTube 업로드 실패 시 에러 로그 불충분](bts/BTS-0000030.md) ✅
- 🟠 [BTS-0000029: az.bat이 서버를 자동으로 재시작하지 않음](bts/BTS-0000029.md) ✅
- 🟠 [BTS-0000028: 모든 단계에서 로그 파일이 저장되지 않음](bts/BTS-0000028.md) ✅
- 🟠 [BTS-0000027: unified-worker에서 parseJsonSafely를 this.parseJsonSafely로 잘못 호출](bts/BTS-0000027.md) ✅
- 🔴 [BTS-0000026: unified-worker YouTube 락에 race condition 존재](bts/BTS-0000026.md) ✅
- 🔴 [BTS-0000025-2: unified-worker YouTube 중복 업로드 방지 로직 누락](bts/BTS-0000025-2.md) ✅
- 🟠 [BTS-0000025: 스케줄 시간 표시 버그 (타임존 문제)](bts/BTS-0000025.md) ✅
- 🟠 [BTS-0000024: unified-worker에 상품/숏폼 YouTube 설명/댓글 로직 누락](bts/BTS-0000024.md) ✅
- 🟠 [BTS-0000023: unified-worker YouTube 토큰 경로 오류](bts/BTS-0000023.md) ✅
- 🟡 [BTS-0000022: unified-worker youtube 로그가 youtube.log 파일에 기록 안됨](bts/BTS-0000022.md) ✅
- 🟠 [BTS-0000021: youtube_upload_cli.py 인자 형식 불일치](bts/BTS-0000021.md) ✅
- 🟠 [BTS-0000020: PYTHONPATH 설정했는데도 src 모듈 import 실패](bts/BTS-0000020.md) ✅
- 🟠 [BTS-0000019: youtube upload.py 파일명 오류](bts/BTS-0000019.md) ✅
- 🟠 [BTS-0000018: video 단계에서 또 completed 설정됨](bts/BTS-0000018.md) ✅
- 🟠 [BTS-0000017: video 생성 비동기 실행으로 youtube 단계 조기 진입](bts/BTS-0000017.md) ✅
- 🔴 [BTS-0000010: 스펙 오해로 인한 잘못된 스키마 수정 (최대 버그!)](bts/BTS-0000010.md) ✅
- 🔴 [BTS-0000001: locked_by 컬럼 참조 에러](bts/BTS-0000001.md) ✅
- 🟠 [BTS-0000002: TTS speed 포맷 에러](bts/BTS-0000002.md) ✅
- 🟠 [BTS-0000003: SQLite 레거시 코드 미제거](bts/BTS-0000003.md) ✅
- 🟠 [BTS-0000004: 서버 자동 재시작 문제](bts/BTS-0000004.md) ✅
- 🟠 [BTS-0000005: 일부 수정으로 인한 반복 에러](bts/BTS-0000005.md) ✅
- 🟡 [BTS-0000006: 제목 수정 폼 채널 표시 오류](bts/BTS-0000006.md) ✅
- 🟠 [BTS-0000007: product_info 잘못된 테이블 참조](bts/BTS-0000007.md) ✅
- 🟠 [BTS-0000008: content.status 단계 기록 누락 (중간 단계 미반영)](bts/BTS-0000008.md) ✅
- 🟠 [BTS-0000011: TTS 음성 설정이 저장되지 않는 문제](bts/BTS-0000011.md) ✅
- 🟠 [BTS-0000012: 중간 단계에서 task_queue.status='completed' 설정되는 문제 (completed 대란)](bts/BTS-0000012.md) ✅
- 🟠 [BTS-0000013: open-folder API에 SQLite 레거시 코드 미전환](bts/BTS-0000013.md) ✅
- 🟡 [BTS-0000014: 완료 상태에 재시도 버튼 없음](bts/BTS-0000014.md) ✅
- 🟠 [BTS-0000016: video 단계를 completed로 잘못 설정](bts/BTS-0000016.md) ✅
- 🟡 [BTS-0000015: 버그등록 버튼이 사라지는 문제](bts/BTS-0000015.md) ✅
