"""
DB 로깅 통합 테스트

테스트 항목:
1. DatabaseLogHandler 기본 동작
2. setup_db_logging() 함수
3. auto_setup_db_logging() 환경변수 테스트
4. job_logs 테이블에 실제 저장 확인
"""

import sys
import os
from pathlib import Path

# Windows 인코딩 문제 해결
if sys.platform == 'win32':
    import io
    sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')

# 백엔드 경로 추가
backend_path = Path(__file__).parent / 'trend-video-backend'
sys.path.insert(0, str(backend_path))

import sqlite3
import logging
from datetime import datetime

print("=" * 70)
print("🧪 DB 로깅 통합 테스트")
print("=" * 70)
print()

# DB 경로
db_path = Path(__file__).parent / 'trend-video-frontend' / 'data' / 'database.sqlite'
if not db_path.exists():
    print(f"❌ 데이터베이스를 찾을 수 없습니다: {db_path}")
    sys.exit(1)

print(f"✅ 데이터베이스 경로: {db_path}")
print()

# 테스트 job_id
test_job_id = f"test_job_{datetime.now().strftime('%Y%m%d_%H%M%S')}"
print(f"🆔 테스트 Job ID: {test_job_id}")
print()

# =============================================================================
# 테스트 1: DatabaseLogHandler 직접 사용
# =============================================================================
print("📋 테스트 1: DatabaseLogHandler 직접 사용")
print("-" * 70)

try:
    from src.utils import DatabaseLogHandler

    # 로거 생성
    logger1 = logging.getLogger('test.direct')
    logger1.setLevel(logging.INFO)

    # 핸들러 추가
    db_handler = DatabaseLogHandler(str(db_path), test_job_id)
    formatter = logging.Formatter(
        '%(asctime)s - %(levelname)s - %(message)s',
        datefmt='%Y-%m-%d %H:%M:%S'
    )
    db_handler.setFormatter(formatter)
    logger1.addHandler(db_handler)

    # 로그 출력
    logger1.info("테스트 메시지 1 - DatabaseLogHandler 직접 사용")
    logger1.info("테스트 메시지 2 - 두 번째 로그")
    logger1.warning("테스트 경고 메시지")
    logger1.error("테스트 에러 메시지")

    # 핸들러 닫기
    db_handler.close()

    # DB에서 확인
    conn = sqlite3.connect(db_path)
    cursor = conn.cursor()
    cursor.execute(
        'SELECT COUNT(*) FROM job_logs WHERE job_id = ?',
        (test_job_id,)
    )
    count = cursor.fetchone()[0]
    conn.close()

    if count >= 4:
        print(f"   ✅ 성공: {count}개 로그가 DB에 저장됨")
    else:
        print(f"   ❌ 실패: {count}개만 저장됨 (4개 예상)")

except Exception as e:
    print(f"   ❌ 오류: {e}")
    import traceback
    traceback.print_exc()

print()

# =============================================================================
# 테스트 2: setup_db_logging() 함수
# =============================================================================
print("📋 테스트 2: setup_db_logging() 함수")
print("-" * 70)

try:
    from src.utils import setup_db_logging

    test_job_id_2 = f"{test_job_id}_setup"

    # setup_db_logging으로 로거 생성
    logger2 = setup_db_logging(
        job_id=test_job_id_2,
        logger_name='test.setup'
    )

    # 로그 출력
    logger2.info("테스트 메시지 1 - setup_db_logging 사용")
    logger2.info("테스트 메시지 2 - Python 영상 생성 시뮬레이션")
    logger2.info("📹 scene 1/5 처리 중...")
    logger2.info("📹 scene 2/5 처리 중...")
    logger2.info("✅ 영상 생성 완료!")

    # DB에서 확인
    conn = sqlite3.connect(db_path)
    cursor = conn.cursor()
    cursor.execute(
        'SELECT COUNT(*) FROM job_logs WHERE job_id = ?',
        (test_job_id_2,)
    )
    count = cursor.fetchone()[0]

    # 실제 로그 내용도 확인
    cursor.execute(
        'SELECT log_message, created_at FROM job_logs WHERE job_id = ? ORDER BY id ASC',
        (test_job_id_2,)
    )
    logs = cursor.fetchall()
    conn.close()

    if count >= 5:
        print(f"   ✅ 성공: {count}개 로그가 DB에 저장됨")
        print(f"   📝 로그 내용:")
        for log_msg, created_at in logs[:3]:
            print(f"      [{created_at}] {log_msg[:60]}")
        if len(logs) > 3:
            print(f"      ... (총 {len(logs)}개)")
    else:
        print(f"   ❌ 실패: {count}개만 저장됨 (5개 예상)")

except Exception as e:
    print(f"   ❌ 오류: {e}")
    import traceback
    traceback.print_exc()

print()

# =============================================================================
# 테스트 3: auto_setup_db_logging() 환경변수
# =============================================================================
print("📋 테스트 3: auto_setup_db_logging() 환경변수")
print("-" * 70)

try:
    from src.utils import auto_setup_db_logging

    test_job_id_3 = f"{test_job_id}_auto"

    # 환경변수 설정
    os.environ['JOB_ID'] = test_job_id_3

    # auto_setup_db_logging으로 로거 생성
    logger3 = auto_setup_db_logging(logger_name='test.auto')

    # 로그 출력
    logger3.info("테스트 메시지 1 - auto_setup_db_logging 사용")
    logger3.info("테스트 메시지 2 - 환경변수에서 JOB_ID 자동 감지")
    logger3.info("🎬 영상 생성 시작...")
    logger3.info("🖼️ 이미지 생성 중...")
    logger3.info("🎵 오디오 생성 중...")
    logger3.info("✅ 완료!")

    # 환경변수 제거
    del os.environ['JOB_ID']

    # DB에서 확인
    conn = sqlite3.connect(db_path)
    cursor = conn.cursor()
    cursor.execute(
        'SELECT COUNT(*) FROM job_logs WHERE job_id = ?',
        (test_job_id_3,)
    )
    count = cursor.fetchone()[0]
    conn.close()

    if count >= 6:
        print(f"   ✅ 성공: {count}개 로그가 DB에 저장됨")
        print(f"   🌍 환경변수 JOB_ID 자동 감지 작동")
    else:
        print(f"   ❌ 실패: {count}개만 저장됨 (6개 예상)")

except Exception as e:
    print(f"   ❌ 오류: {e}")
    import traceback
    traceback.print_exc()

print()

# =============================================================================
# 테스트 4: StoryVideoCreator 통합 테스트 (시뮬레이션)
# =============================================================================
print("📋 테스트 4: StoryVideoCreator 시뮬레이션")
print("-" * 70)

try:
    test_job_id_4 = f"{test_job_id}_story"

    # StoryVideoCreator 임포트 (실제 생성은 안 함)
    from src.video_generator.story_video_creator import StoryVideoCreator

    # job_id와 함께 생성 (설정은 더미)
    config = {
        "ai": {
            "llm": {"provider": "openai"},
            "image_generation": {"provider": "openai"}
        },
        "output": {"directory": "output"}
    }

    # OPENAI_API_KEY 임시 설정 (없으면 생성자가 에러)
    original_key = os.environ.get('OPENAI_API_KEY')
    if not original_key:
        os.environ['OPENAI_API_KEY'] = 'test_key'

    try:
        creator = StoryVideoCreator(config, job_id=test_job_id_4)

        # 로거가 설정되었는지 확인
        if hasattr(creator, 'logger'):
            creator.logger.info("StoryVideoCreator 초기화 완료")
            creator.logger.info("테스트 로그 - 대본 생성 중...")
            creator.logger.info("테스트 로그 - 이미지 생성 중...")

            # DB에서 확인
            conn = sqlite3.connect(db_path)
            cursor = conn.cursor()
            cursor.execute(
                'SELECT COUNT(*) FROM job_logs WHERE job_id = ?',
                (test_job_id_4,)
            )
            count = cursor.fetchone()[0]
            conn.close()

            if count >= 3:
                print(f"   ✅ 성공: StoryVideoCreator 로거가 DB에 연결됨")
                print(f"   📊 {count}개 로그 저장됨")
            else:
                print(f"   ⚠️  부분 성공: {count}개 로그 저장됨 (3개 예상)")
        else:
            print(f"   ❌ 실패: logger 속성이 없음")

    finally:
        # 환경변수 복원
        if original_key:
            os.environ['OPENAI_API_KEY'] = original_key
        elif 'OPENAI_API_KEY' in os.environ:
            del os.environ['OPENAI_API_KEY']

except Exception as e:
    print(f"   ❌ 오류: {e}")
    import traceback
    traceback.print_exc()

print()

# =============================================================================
# 테스트 결과 요약
# =============================================================================
print("=" * 70)
print("📊 테스트 결과 요약")
print("=" * 70)

# 모든 테스트 job_id의 로그 개수 확인
conn = sqlite3.connect(db_path)
cursor = conn.cursor()

test_job_ids = [
    test_job_id,
    f"{test_job_id}_setup",
    f"{test_job_id}_auto",
    f"{test_job_id}_story"
]

total_logs = 0
for job_id in test_job_ids:
    cursor.execute(
        'SELECT COUNT(*) FROM job_logs WHERE job_id = ?',
        (job_id,)
    )
    count = cursor.fetchone()[0]
    total_logs += count
    print(f"   {job_id}: {count}개 로그")

print()
print(f"✅ 총 {total_logs}개 로그가 job_logs 테이블에 저장되었습니다.")
print()

# 최근 로그 5개 출력
cursor.execute('''
    SELECT job_id, log_message, created_at
    FROM job_logs
    WHERE job_id LIKE ?
    ORDER BY id DESC
    LIMIT 5
''', (f'{test_job_id}%',))

recent_logs = cursor.fetchall()
if recent_logs:
    print("📝 최근 저장된 로그 (최신 5개):")
    for job_id, log_msg, created_at in recent_logs:
        print(f"   [{created_at}] {log_msg[:60]}")

conn.close()

print()
print("=" * 70)
print("🎉 테스트 완료!")
print()
print("💡 다음 단계:")
print("   1. 실제 영상 생성을 실행해보세요")
print("   2. 자동화 페이지에서 로그가 실시간으로 표시되는지 확인")
print("   3. job_logs 테이블을 직접 쿼리해서 로그 확인")
print()
print("🗑️  테스트 데이터 정리:")
print(f"   DELETE FROM job_logs WHERE job_id LIKE '{test_job_id}%';")
print("=" * 70)
