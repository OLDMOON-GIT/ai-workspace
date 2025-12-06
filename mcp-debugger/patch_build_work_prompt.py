import re

# 파일 읽기
with open('spawning-pool.py', 'r', encoding='utf-8') as f:
    content = f.read()

# 기존 함수 정규식으로 찾아서 교체
pattern = r'def build_work_prompt\(bug: Bug\) -> str:\s+"""작업 프롬프트 생성"""\s+bug_type = \'SPEC\' if bug\.type == \'spec\' else \'BUG\'\s+return f"""BTS-\{bug\.id\} \{bug_type\} 해결 요청\s+제목: \{bug\.title\}\s+우선순위: \{bug\.priority\}\s+설명: \{\(bug\.summary or \'\'\)\[:1000\]\}\s+작업 완료 후 반드시 실행:\s+node bug\.js resolve \{bug\.id\} "해결 내용"\s+"""'

new_func = '''def build_work_prompt(bug: Bug) -> str:
    """작업 프롬프트 생성

    BTS-3244: 대본 작성 작업의 경우 JSON 출력 지시를 명확히 추가
    """
    bug_type = 'SPEC' if bug.type == 'spec' else 'BUG'

    # BTS-3244: 대본 작성 관련 키워드 감지
    title_lower = bug.title.lower()
    summary_lower = (bug.summary or '').lower()
    combined = title_lower + ' ' + summary_lower

    script_keywords = ['대본', 'script', '스크립트', 'story.json', 'json 형식', 'json format']
    is_script_task = any(kw in combined for kw in script_keywords)

    # BTS-3244: 대본 작성 작업인 경우 JSON 출력 지시 강화
    if is_script_task:
        return f"""BTS-{bug.id} {bug_type} 해결 요청

제목: {bug.title}
우선순위: {bug.priority}
설명: {(bug.summary or '')[:1000]}

⚠️ 중요: JSON 출력 규칙 (필수)
- 출력은 반드시 순수 JSON 객체여야 합니다
- 마크다운 코드블록(```) 사용 금지
- JSON 앞뒤에 설명, 인사말, 질문 금지
- 출력은 {{ 로 시작하고 }} 로 끝나야 함
- 한글은 유니코드(\uXXXX) 대신 직접 한글 문자로 출력

작업 완료 후 반드시 실행:
node bug.js resolve {bug.id} "해결 내용"
"""

    # 일반 버그/SPEC
    return f"""BTS-{bug.id} {bug_type} 해결 요청

제목: {bug.title}
우선순위: {bug.priority}
설명: {(bug.summary or '')[:1000]}

작업 완료 후 반드시 실행:
node bug.js resolve {bug.id} "해결 내용"
\"\"\""""

if re.search(pattern, content):
    content = re.sub(pattern, new_func, content)
    with open('spawning-pool.py', 'w', encoding='utf-8') as f:
        f.write(content)
    print('수정 완료!')
else:
    print('패턴을 찾을 수 없습니다. 수동 확인 필요.')
    # 함수 시작 위치 찾기
    idx = content.find('def build_work_prompt')
    if idx >= 0:
        print(f'함수 위치: {idx}')
        print('내용:', content[idx:idx+500])
