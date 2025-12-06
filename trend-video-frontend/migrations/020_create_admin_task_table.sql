-- Admin task management table for /api/tasks endpoint
CREATE TABLE IF NOT EXISTS admin_task (
  id VARCHAR(50) PRIMARY KEY,
  content TEXT NOT NULL,
  status ENUM('todo', 'ing', 'done') NOT NULL DEFAULT 'todo',
  priority INT NOT NULL DEFAULT 0,
  logs TEXT,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  completed_at DATETIME NULL,
  INDEX idx_admin_task_status (status),
  INDEX idx_admin_task_created_at (created_at),
  INDEX idx_admin_task_priority_created (priority, created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
