#!/usr/bin/env python3
"""
BTS-3081 통합 테스트: spawning-pool의 좀비 버그 reclaim 기능 테스트
"""

import subprocess
import sys
import os

# Add parent directory to path
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

# Import directly from file
import importlib.util
spec = importlib.util.spec_from_file_location("spawning_pool",
    os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "spawning-pool.py"))
spawning_pool = importlib.util.module_from_spec(spec)
spec.loader.exec_module(spawning_pool)

def test_is_process_running():
    """PID 체크 함수 테스트"""
    print("Test 1: is_process_running()")

    # 현재 프로세스는 살아있어야 함
    my_pid = os.getpid()
    assert spawning_pool.is_process_running(my_pid) == True, f"My PID {my_pid} should be running"
    print(f"  [OK] Current PID {my_pid} detected as running")

    # 존재하지 않는 PID는 죽어있어야 함
    assert spawning_pool.is_process_running(99999) == False, "PID 99999 should not be running"
    print(f"  [OK] PID 99999 detected as dead")

    # None은 False 반환
    assert spawning_pool.is_process_running(None) == False, "None PID should return False"
    print(f"  [OK] None PID returns False")

    print("  [PASS] is_process_running() tests passed")
    return True

def test_get_open_bugs_with_zombie():
    """좀비 버그 조회 테스트 (BTS-3081)"""
    print("\nTest 2: get_open_bugs() with zombie bug")

    import mysql.connector

    DB_CONFIG = {
        'host': 'localhost',
        'user': 'root',
        'password': 'trend2024',
        'database': 'trend_video'
    }

    conn = mysql.connector.connect(**DB_CONFIG)
    cursor = conn.cursor()

    # 테스트용 버그 생성 (in_progress + 죽은 PID)
    cursor.execute("""
        INSERT INTO bugs (type, priority, title, summary, status, worker_pid, created_at, updated_at)
        VALUES ('bug', 'P3', 'BTS-3081 Test Zombie Bug', 'Test bug for zombie reclaim', 'in_progress', 88888, NOW(), NOW())
    """)
    conn.commit()
    test_bug_id = cursor.lastrowid
    print(f"  Created test bug BTS-{test_bug_id} (in_progress, PID 88888)")

    try:
        # get_open_bugs 호출 - 좀비 버그가 조회되어야 함
        bugs = spawning_pool.get_open_bugs(limit=10)

        found_test_bug = False
        for bug in bugs:
            if bug.id == test_bug_id:
                found_test_bug = True
                print(f"  [OK] Found zombie bug BTS-{bug.id} (status: {bug.status}, PID: {bug.worker_pid})")
                break

        assert found_test_bug, f"Zombie bug BTS-{test_bug_id} should be found in get_open_bugs()"
        print("  [PASS] Zombie bug detected correctly")

    finally:
        # 테스트 버그 삭제
        cursor.execute("DELETE FROM bugs WHERE id = %s", (test_bug_id,))
        conn.commit()
        print(f"  Cleaned up test bug BTS-{test_bug_id}")
        conn.close()

    return True

def test_claim_zombie_bug():
    """좀비 버그 claim 테스트 (BTS-3081)"""
    print("\nTest 3: claim_bug() for zombie bug")

    import mysql.connector

    DB_CONFIG = {
        'host': 'localhost',
        'user': 'root',
        'password': 'trend2024',
        'database': 'trend_video'
    }

    conn = mysql.connector.connect(**DB_CONFIG)
    cursor = conn.cursor()

    # 테스트용 좀비 버그 생성
    cursor.execute("""
        INSERT INTO bugs (type, priority, title, summary, status, worker_pid, created_at, updated_at)
        VALUES ('bug', 'P3', 'BTS-3081 Test Claim Zombie', 'Test bug for claim zombie', 'in_progress', 77777, NOW(), NOW())
    """)
    conn.commit()
    test_bug_id = cursor.lastrowid
    print(f"  Created test zombie bug BTS-{test_bug_id} (in_progress, PID 77777)")

    try:
        # claim_bug 호출 - 성공해야 함
        result = spawning_pool.claim_bug(test_bug_id, 'test-worker')
        assert result == True, f"claim_bug({test_bug_id}) should succeed for zombie bug"
        print(f"  [OK] Successfully claimed zombie bug BTS-{test_bug_id}")

        # DB에서 확인
        cursor.execute("SELECT status, worker_pid FROM bugs WHERE id = %s", (test_bug_id,))
        row = cursor.fetchone()
        assert row[0] == 'in_progress', "Status should remain in_progress"
        assert row[1] == os.getpid(), f"worker_pid should be updated to {os.getpid()}"
        print(f"  [OK] Bug status: {row[0]}, PID: {row[1]} (expected: {os.getpid()})")

        print("  [PASS] Zombie bug claim works correctly")

    finally:
        # 테스트 버그 삭제
        cursor.execute("DELETE FROM bugs WHERE id = %s", (test_bug_id,))
        conn.commit()
        print(f"  Cleaned up test bug BTS-{test_bug_id}")
        conn.close()

    return True

def run_all_tests():
    """모든 테스트 실행"""
    print("=" * 60)
    print("BTS-3081 Integration Tests: Zombie Bug Reclaim")
    print("=" * 60)

    tests = [
        test_is_process_running,
        test_get_open_bugs_with_zombie,
        test_claim_zombie_bug,
    ]

    passed = 0
    failed = 0

    for test in tests:
        try:
            if test():
                passed += 1
        except Exception as e:
            print(f"  [FAIL] {e}")
            failed += 1

    print("\n" + "=" * 60)
    print(f"Results: {passed} passed, {failed} failed")
    print("=" * 60)

    return failed == 0

if __name__ == '__main__':
    success = run_all_tests()
    sys.exit(0 if success else 1)
