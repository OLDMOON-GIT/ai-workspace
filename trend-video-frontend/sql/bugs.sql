-- ============================================================
-- Bugs 관리 테이블
-- ============================================================

CREATE TABLE IF NOT EXISTS bugs (
  bug_id VARCHAR(20) PRIMARY KEY COMMENT 'BTS-0000001 형식',
  title VARCHAR(500) NOT NULL COMMENT '버그 제목',
  description TEXT COMMENT '버그 상세 설명',
  severity ENUM('CRITICAL', 'HIGH', 'MEDIUM', 'LOW', 'MINOR') NOT NULL DEFAULT 'MEDIUM' COMMENT '심각도',
  status ENUM('open', 'in_progress', 'resolved', 'closed') NOT NULL DEFAULT 'open' COMMENT '처리 상태',
  category VARCHAR(100) COMMENT '버그 카테고리 (UI, API, Database, Logic 등)',

  -- 메타 정보
  affected_files JSON COMMENT '영향받는 파일 목록',
  solution TEXT COMMENT '해결 방법',
  notes TEXT COMMENT '추가 노트',
  tags JSON COMMENT '태그 배열',

  -- 담당자 정보
  reporter VARCHAR(100) COMMENT '보고자',
  assignee VARCHAR(100) COMMENT '담당자',

  -- 타임스탬프
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP COMMENT '발생일',
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '수정일',
  resolved_at DATETIME COMMENT '해결일',

  -- 인덱스
  INDEX idx_bugs_status (status),
  INDEX idx_bugs_severity (severity),
  INDEX idx_bugs_created_at (created_at),
  INDEX idx_bugs_category (category)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='버그 추적 시스템';

-- 자동 증가 시퀀스를 위한 헬퍼 함수 (bug_id 생성)
-- 사용법: SELECT CONCAT('BTS-', LPAD(next_bug_number, 7, '0'));
CREATE TABLE IF NOT EXISTS bug_sequence (
  id INT PRIMARY KEY DEFAULT 1,
  next_number INT NOT NULL DEFAULT 1
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT INTO bug_sequence (id, next_number) VALUES (1, 1) ON DUPLICATE KEY UPDATE id=id;
