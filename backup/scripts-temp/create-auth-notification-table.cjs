const mysql = require('mysql2/promise');

async function main() {
  const conn = await mysql.createConnection({
    host: 'localhost',
    user: 'root',
    password: 'trend2024',
    database: 'trend_video'
  });

  try {
    await conn.query(`
      CREATE TABLE IF NOT EXISTS auth_notification (
        notification_id INT AUTO_INCREMENT PRIMARY KEY,
        user_id VARCHAR(255),
        service VARCHAR(100) NOT NULL,
        message TEXT NOT NULL,
        action_url TEXT,
        action_label VARCHAR(100),
        is_read TINYINT DEFAULT 0,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        INDEX idx_auth_notification_user_id (user_id),
        INDEX idx_auth_notification_service (service),
        INDEX idx_auth_notification_is_read (is_read),
        INDEX idx_auth_notification_created_at (created_at)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
    console.log('✅ auth_notification table created successfully');
  } finally {
    await conn.end();
  }
}

main().catch(console.error);
