-- YouTube 업로드 이력 테이블 생성
CREATE TABLE IF NOT EXISTS youtube_uploads (
  id INT AUTO_INCREMENT PRIMARY KEY,
  content_id CHAR(36) NOT NULL,
  youtube_url VARCHAR(500) NOT NULL,
  youtube_video_id VARCHAR(50),
  status VARCHAR(50) DEFAULT 'active',
  uploaded_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_youtube_uploads_content_id (content_id),
  INDEX idx_youtube_uploads_uploaded_at (uploaded_at),
  INDEX idx_youtube_uploads_status (status),
  FOREIGN KEY (content_id) REFERENCES content(content_id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 기존 데이터 마이그레이션 (youtube_url이 있는 것들)
INSERT INTO youtube_uploads (content_id, youtube_url, uploaded_at)
SELECT content_id, youtube_url, updated_at
FROM content
WHERE youtube_url IS NOT NULL AND youtube_url != '';
