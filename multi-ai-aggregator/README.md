# 🤖 Multi-AI Aggregator

여러 AI 챗봇(ChatGPT, Claude, Gemini, Grok)에 동시에 질문하고 답변을 취합하는 자동화 도구입니다.

## ✨ 특징

- 🌐 **크롬 브라우저 자동화**: Playwright를 사용하여 실제 브라우저에서 동작
- 🔄 **병렬 처리**: 여러 AI 모델에 동시에 질문을 보내 빠른 응답 수집
- 🎨 **예쁜 출력**: 컬러풀한 터미널 출력으로 각 AI의 답변을 구분
- 📊 **자동 요약**: 모든 답변을 분석하고 공통 주제 추출
- 💾 **파일 저장**: 답변을 텍스트 파일로 저장 가능
- 🎭 **헤드리스/헤드풀 모드**: 브라우저를 보이게/안 보이게 선택 가능
- 🎯 **선택적 에이전트**: 원하는 AI만 선택해서 사용 가능

## 📋 사전 요구사항

- Python 3.8+
- 각 AI 서비스에 로그인된 Chrome 브라우저 세션 (또는 수동 로그인 준비)

## 🚀 설치 방법

### 1. 프로젝트 클론 또는 다운로드

```bash
cd multi-ai-aggregator
```

### 2. 의존성 설치

```bash
pip install -r requirements.txt
```

### 3. Playwright 브라우저 설치

```bash
playwright install chromium
```

## 💻 사용 방법

### 인터랙티브 모드 (추천)

가장 간단한 방법입니다. 프로그램을 실행하고 질문을 입력하세요:

```bash
python main.py
```

또는 명시적으로 인터랙티브 모드 지정:

```bash
python main.py -i
```

**인터랙티브 모드 명령어:**
- 질문을 입력하고 Enter
- `agents` - 사용할 AI 선택
- `mode` - 헤드리스/헤드풀 모드 전환
- `quit` 또는 `exit` - 종료

### 커맨드라인 모드

한 번에 질문하고 결과를 받으려면:

```bash
python main.py -q "인공지능의 미래는 어떻게 될까요?"
```

**옵션:**
- `-q` 또는 `--question`: 질문 내용
- `--headless`: 헤드리스 모드 (브라우저 안 보임)
- `-a` 또는 `--agents`: 사용할 AI 선택 (예: `chatgpt,claude`)
- `-i` 또는 `--interactive`: 인터랙티브 모드

### 예시

#### 특정 AI만 사용하기
```bash
python main.py -q "Python과 JavaScript 중 어떤 언어가 더 좋나요?" -a chatgpt,claude
```

#### 헤드리스 모드로 실행
```bash
python main.py -q "양자 컴퓨터란 무엇인가요?" --headless
```

#### Claude와 Gemini만 사용
```bash
python main.py -q "기후 변화 해결 방법은?" -a claude,gemini
```

## 🔧 구조

```
multi-ai-aggregator/
├── main.py              # 메인 실행 파일
├── aggregator.py        # 답변 취합 및 요약 로직
├── requirements.txt     # Python 의존성
├── agents/              # AI 에이전트들
│   ├── __init__.py
│   ├── base_agent.py    # 기본 에이전트 클래스
│   ├── chatgpt_agent.py # ChatGPT 에이전트
│   ├── claude_agent.py  # Claude 에이전트
│   ├── gemini_agent.py  # Gemini 에이전트
│   └── grok_agent.py    # Grok 에이전트
└── README.md
```

## ⚙️ 작동 원리

1. **브라우저 실행**: Playwright가 Chromium 브라우저를 실행
2. **병렬 탭 오픈**: 각 AI 서비스마다 새 탭을 동시에 오픈
3. **로그인 확인**: 자동으로 로그인 상태 확인 (필요시 수동 로그인)
4. **질문 전송**: 모든 AI에 동시에 질문을 입력
5. **응답 대기**: 각 AI의 응답을 기다림 (약 10초)
6. **답변 수집**: 각 AI의 답변을 추출
7. **결과 표시**: 컬러풀한 형태로 모든 답변 표시
8. **요약 생성**: 공통 주제와 키워드 분석

## 🔐 로그인 처리

첫 실행 시 각 AI 서비스에 로그인이 필요할 수 있습니다:

1. **자동 로그인 감지**: 이미 로그인되어 있으면 자동으로 진행
2. **수동 로그인**: 로그인이 필요하면 브라우저 창에서 수동으로 로그인
3. **세션 유지**: 한 번 로그인하면 브라우저 프로필에 저장됨

## 📝 출력 예시

```
================================================================================
🤖 Multi-AI Aggregator
================================================================================

Question: 인공지능의 미래는?

Mode: Headful (visible browser)

Selected agents: ChatGPT, Claude, Gemini, Grok

[ChatGPT] Initializing...
[Claude] Initializing...
[Gemini] Initializing...
[Grok] Initializing...

================================================================================
📊 RESPONSES FROM ALL AI AGENTS
================================================================================

┌─ ChatGPT
│
│ 인공지능의 미래는 매우 밝습니다...
│
└──────────────────────────────────────────────────────────────────────────────

┌─ Claude
│
│ AI 기술은 계속 발전할 것이며...
│
└──────────────────────────────────────────────────────────────────────────────

...
```

## 🐛 문제 해결

### 브라우저가 실행되지 않음
```bash
playwright install chromium
```

### AI 사이트에서 응답을 가져오지 못함
- 수동으로 로그인이 필요할 수 있습니다
- 헤드풀 모드(`--headless` 없이)로 실행하여 확인하세요
- 각 AI 사이트의 HTML 구조가 변경되었을 수 있습니다 (selectors 업데이트 필요)

### 특정 AI만 작동하지 않음
```bash
# 해당 AI를 제외하고 실행
python main.py -q "질문" -a chatgpt,claude
```

## 🔄 커스터마이징

### 새로운 AI 추가하기

1. `agents/` 폴더에 새 에이전트 파일 생성 (예: `perplexity_agent.py`)
2. `BaseAgent`를 상속받아 구현
3. `agents/__init__.py`에 추가
4. `main.py`의 `agent_map`에 추가

### 응답 대기 시간 조정

각 에이전트 파일의 `send_question` 메서드에서 `await asyncio.sleep()` 값을 조정하세요.

## 📄 라이센스

이 프로젝트는 MIT 라이센스를 따릅니다.

## 🤝 기여

버그 리포트, 기능 제안, Pull Request 환영합니다!

## ⚠️ 주의사항

- 이 도구는 교육 및 개인 사용 목적입니다
- 각 AI 서비스의 이용 약관을 준수하세요
- 과도한 자동화는 계정 제재를 받을 수 있습니다
- 웹사이트 구조 변경 시 selector가 작동하지 않을 수 있습니다

## 📧 문의

문제가 있거나 개선 사항이 있으면 이슈를 등록해주세요!

---

Made with ❤️ for AI enthusiasts
