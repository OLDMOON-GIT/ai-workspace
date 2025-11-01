# Multi-AI Aggregator Web Application

이 웹 애플리케이션을 통해 브라우저에서 AI 대본을 생성할 수 있습니다.

## 설치 방법

```bash
# Flask 설치
pip install -r requirements.txt
```

## 실행 방법

```bash
# 웹 서버 시작
python web_app.py
```

서버가 시작되면 브라우저에서 `http://localhost:3000/admin/tasks`로 접속하세요.

## 사용 방법

1. **대본 생성**
   - 제목 입력란에 원하는 영상 제목을 입력합니다
   - "대본 생성하기" 버튼을 클릭합니다
   - Claude가 대본을 생성할 때까지 기다립니다 (1-2분 소요)
   - 생성이 완료되면 성공 메시지가 표시됩니다

2. **생성된 대본 확인**
   - 페이지 하단의 "생성된 대본 목록"에서 모든 대본을 확인할 수 있습니다
   - "보기" 버튼을 클릭하면 대본 전체 내용을 볼 수 있습니다

3. **대본 저장 위치**
   - 모든 대본은 `scripts/` 디렉토리에 저장됩니다
   - 파일명 형식: `script_YYYYMMDD_HHMMSS.txt`

## API 엔드포인트

### POST /api/generate-script
제목을 받아서 Claude를 통해 대본을 생성합니다.

**요청:**
```json
{
  "title": "영상 제목"
}
```

**응답:**
```json
{
  "success": true,
  "message": "대본이 성공적으로 생성되었습니다",
  "script_path": "scripts/script_20251030_123456.txt",
  "content": "..."
}
```

### GET /api/scripts
생성된 모든 대본의 목록을 반환합니다.

**응답:**
```json
{
  "scripts": [
    {
      "filename": "script_20251030_123456.txt",
      "title": "영상 제목",
      "created": "2025-10-30 12:34:56"
    }
  ]
}
```

### GET /api/scripts/:filename
특정 대본의 전체 내용을 반환합니다.

**응답:**
```json
{
  "filename": "script_20251030_123456.txt",
  "content": "..."
}
```

## 작동 원리

1. 사용자가 제목을 입력하고 "대본 생성하기" 버튼 클릭
2. 웹 서버가 `python main.py -q "{title}" -a claude` 명령 실행
3. Claude가 질문에 대한 응답 생성
4. 응답이 `ai_responses_TIMESTAMP.txt` 파일로 저장됨
5. 웹 서버가 최신 응답 파일을 읽어서 `scripts/` 디렉토리에 대본으로 저장
6. 사용자에게 결과 표시

## 문제 해결

### Flask가 설치되지 않은 경우
```bash
pip install flask
```

### 포트 3000이 이미 사용 중인 경우
`web_app.py` 파일의 마지막 줄에서 포트 번호를 변경하세요:
```python
app.run(host='0.0.0.0', port=5000, debug=True)  # 3000 -> 5000
```

### main.py 실행 오류
먼저 터미널에서 직접 테스트해보세요:
```bash
python main.py -q "테스트 제목" -a claude
```
