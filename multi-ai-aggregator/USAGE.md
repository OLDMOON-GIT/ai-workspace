# Multi-AI Aggregator - 사용 가이드

## 🚀 빠른 시작

### 1단계: 로그인 설정 (처음 한 번만!)

```bash
python setup_login.py
```

**이 단계에서:**
- Chrome이 열리고 ChatGPT, Claude, Gemini, Grok 탭이 모두 열립니다
- 각 탭에서 **천천히 로그인**하세요 (시간 제한 없음!)
- 모든 로그인이 끝나면 Enter를 눌러 저장
- 로그인 정보는 Chrome 프로필에 저장됩니다

**주의:** 이 명령어를 실행하기 전에 Chrome을 완전히 닫아야 합니다!

### 2단계: 질문하기 (빠르게 반복 가능!)

```bash
python main.py -q "파이썬 크롤링 방법은?" -a chatgpt,claude
```

**이 단계에서:**
- Chrome을 다시 닫아야 합니다
- Enter를 누르면 이미 로그인된 상태로 시작!
- 질문이 자동으로 전송되고 응답을 기다립니다
- 응답이 완료되면 자동으로 파일에 저장됩니다

## 📋 사용 예시

### 특정 AI만 사용하기
```bash
# ChatGPT만
python main.py -q "질문" -a chatgpt

# Claude와 Gemini만
python main.py -q "질문" -a claude,gemini

# 모든 AI (기본값)
python main.py -q "질문" -a chatgpt,claude,gemini,grok
```

### 인터랙티브 모드
```bash
python main.py -i
```

계속해서 질문을 입력할 수 있습니다.

## ⚙️ 작동 방식

### 로그인 체크 스킵
실제 Chrome 프로필을 사용하면 자동으로 로그인 체크를 스킵합니다:
- ✅ **빠른 시작**: 3초만에 페이지 로드 완료
- ✅ **안정성**: 로그인 상태 확인 없이 바로 질문
- ✅ **응답 대기**: 완료될 때까지 자동으로 기다림

### 응답 완료 감지
각 AI의 응답이 완료되는 것을 자동으로 감지합니다:
- Stop 버튼 사라짐 확인
- 텍스트가 3초간 변하지 않으면 완료
- 최대 2분까지 대기
- 10초마다 진행 상황 표시

## 📁 출력 파일

모든 응답은 자동으로 저장됩니다:
```
ai_responses_20251030_143052.txt
```

파일 이름에 타임스탬프가 포함되어 덮어쓰기 방지!

## 🔧 고급 옵션

### 별도 프로필 사용 (매번 로그인 필요)
```bash
python main.py -q "질문" --no-chrome-profile
```

### 특정 AI만 로그인 설정
```bash
python setup_login.py -a chatgpt,claude
```

## ❓ 문제 해결

### "Chrome을 닫으세요" 메시지가 나와요
- 작업 관리자(Ctrl+Shift+Esc)를 열고
- "Google Chrome" 프로세스를 모두 종료하세요

### 로그인이 계속 풀려요
- `setup_login.py`를 다시 실행하세요
- 로그인 후 충분히 기다렸다가 Enter를 누르세요

### 응답을 못 가져와요
- 브라우저 창이 열려있는지 확인
- selector가 변경되었을 수 있습니다 (이슈 제보)

## 💡 팁

1. **처음 설정할 때**: `setup_login.py`로 여유있게 로그인
2. **빠른 질문**: `main.py`로 반복해서 사용
3. **여러 질문**: 인터랙티브 모드 (`-i`) 사용
4. **특정 AI**: `-a` 옵션으로 선택

---

**문의사항이나 버그 리포트는 이슈로 등록해주세요!**
