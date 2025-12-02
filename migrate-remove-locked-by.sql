-- locked_by 컬럼 제거 마이그레이션

USE trend_video;

-- task_lock 테이블에서 locked_by 컬럼 제거 (이미 없으면 에러 무시)
ALTER TABLE task_lock DROP COLUMN IF EXISTS locked_by;

-- task_lock 테이블 구조 확인
DESC task_lock;

SELECT 'Migration completed!' as status;
