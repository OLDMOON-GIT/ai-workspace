from flask import Flask, render_template, request, jsonify
import subprocess
import json
import os
import threading
from datetime import datetime

app = Flask(__name__)

# 대본을 저장할 디렉토리
SCRIPTS_DIR = os.path.join(os.path.dirname(__file__), 'scripts')
os.makedirs(SCRIPTS_DIR, exist_ok=True)

# 작업 상태를 추적하는 딕셔너리
tasks = {}

# 롱폼 프롬프트 템플릿
LONG_FORM_PROMPT = """당신은 유튜브 쇼츠 영상 대본 작가입니다.
다음 제목에 대해 1분 이내의 짧고 임팩트 있는 영상 대본을 작성해주세요.

제목: {title}

대본 작성 가이드:
1. 첫 3초 안에 시청자의 관심을 끌 수 있는 훅(Hook) 문장으로 시작
2. 핵심 메시지를 명확하고 간결하게 전달
3. 구어체를 사용하여 친근하게 작성
4. 시청자에게 행동을 유도하는 CTA(Call To Action)로 마무리

대본을 작성해주세요:"""

@app.route('/')
def index():
    return "Multi-AI Aggregator Web Interface"

@app.route('/admin')
def admin_dashboard():
    return render_template('admin_dashboard.html')

@app.route('/admin/titles')
def admin_titles():
    return render_template('admin_titles.html')

def run_script_generation(task_id, title, prompt):
    """백그라운드에서 대본 생성 실행"""
    try:
        tasks[task_id]['status'] = 'ING'
        tasks[task_id]['message'] = 'Claude가 대본을 생성하고 있습니다...'

        # Python 경로 찾기
        python_cmd = 'python'
        main_py_path = os.path.join(os.path.dirname(__file__), 'main.py')

        # 명령 실행
        cmd = [python_cmd, main_py_path, '-q', prompt, '-a', 'claude']

        print(f"Running command: {' '.join(cmd)}")

        result = subprocess.run(
            cmd,
            capture_output=True,
            text=True,
            encoding='utf-8',
            cwd=os.path.dirname(__file__)
        )

        # 최근 생성된 ai_responses 파일 찾기
        response_files = []
        for file in os.listdir(os.path.dirname(__file__)):
            if file.startswith('ai_responses_') and file.endswith('.txt'):
                file_path = os.path.join(os.path.dirname(__file__), file)
                response_files.append((file_path, os.path.getmtime(file_path)))

        if response_files:
            # 가장 최근 파일 선택
            response_files.sort(key=lambda x: x[1], reverse=True)
            latest_response_file = response_files[0][0]

            # 응답 내용 읽기
            with open(latest_response_file, 'r', encoding='utf-8') as f:
                response_content = f.read()

            # 대본 파일로 저장
            timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
            script_filename = f"script_{timestamp}.txt"
            script_path = os.path.join(SCRIPTS_DIR, script_filename)

            with open(script_path, 'w', encoding='utf-8') as f:
                f.write(f"제목: {title}\n")
                f.write(f"생성일시: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}\n")
                f.write("="*80 + "\n\n")
                f.write(response_content)

            tasks[task_id]['status'] = 'DONE'
            tasks[task_id]['message'] = '대본 생성 완료!'
            tasks[task_id]['script_filename'] = script_filename
            tasks[task_id]['content'] = response_content[:500] + '...' if len(response_content) > 500 else response_content
        else:
            tasks[task_id]['status'] = 'ERROR'
            tasks[task_id]['message'] = 'AI 응답 파일을 찾을 수 없습니다'
            tasks[task_id]['stdout'] = result.stdout
            tasks[task_id]['stderr'] = result.stderr

    except Exception as e:
        print(f"Error: {str(e)}")
        tasks[task_id]['status'] = 'ERROR'
        tasks[task_id]['message'] = f'오류가 발생했습니다: {str(e)}'


@app.route('/api/generate-script', methods=['POST'])
def generate_script():
    """제목을 받아서 main.py를 비동기로 실행하고 task_id 반환"""
    try:
        data = request.get_json()
        title = data.get('title', '')

        if not title:
            return jsonify({'error': '제목을 입력해주세요'}), 400

        # 롱폼 프롬프트 생성
        prompt = LONG_FORM_PROMPT.format(title=title)

        # 고유한 task_id 생성
        task_id = f"task_{datetime.now().strftime('%Y%m%d_%H%M%S_%f')}"

        # 작업 상태 초기화
        tasks[task_id] = {
            'task_id': task_id,
            'title': title,
            'status': 'PENDING',
            'message': '작업이 시작됩니다...',
            'created': datetime.now().strftime('%Y-%m-%d %H:%M:%S')
        }

        # 백그라운드 스레드에서 실행
        thread = threading.Thread(target=run_script_generation, args=(task_id, title, prompt))
        thread.daemon = True
        thread.start()

        return jsonify({
            'success': True,
            'task_id': task_id,
            'message': '대본 생성 작업이 시작되었습니다'
        })

    except Exception as e:
        print(f"Error: {str(e)}")
        return jsonify({
            'error': f'오류가 발생했습니다: {str(e)}'
        }), 500


@app.route('/api/task/<task_id>')
def get_task_status(task_id):
    """작업 상태 조회"""
    if task_id not in tasks:
        return jsonify({'error': '작업을 찾을 수 없습니다'}), 404

    return jsonify(tasks[task_id])

@app.route('/api/scripts')
def list_scripts():
    """저장된 대본 목록 조회"""
    try:
        scripts = []
        for file in os.listdir(SCRIPTS_DIR):
            if file.startswith('script_') and file.endswith('.txt'):
                file_path = os.path.join(SCRIPTS_DIR, file)
                with open(file_path, 'r', encoding='utf-8') as f:
                    lines = f.readlines()
                    title = lines[0].replace('제목: ', '').strip() if lines else 'Unknown'

                scripts.append({
                    'filename': file,
                    'title': title,
                    'created': datetime.fromtimestamp(os.path.getmtime(file_path)).strftime('%Y-%m-%d %H:%M:%S')
                })

        scripts.sort(key=lambda x: x['created'], reverse=True)
        return jsonify({'scripts': scripts})
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/scripts/<filename>')
def get_script(filename):
    """특정 대본 내용 조회"""
    try:
        file_path = os.path.join(SCRIPTS_DIR, filename)
        if not os.path.exists(file_path):
            return jsonify({'error': '파일을 찾을 수 없습니다'}), 404

        with open(file_path, 'r', encoding='utf-8') as f:
            content = f.read()

        return jsonify({
            'filename': filename,
            'content': content
        })
    except Exception as e:
        return jsonify({'error': str(e)}), 500

if __name__ == '__main__':
    app.run(host='0.0.0.0', port=5000, debug=True)
