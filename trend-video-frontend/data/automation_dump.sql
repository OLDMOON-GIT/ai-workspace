PRAGMA foreign_keys=OFF;
BEGIN TRANSACTION;
CREATE TABLE coupang_product (coupang_id TEXT PRIMARY KEY, user_id TEXT NOT NULL, product_url TEXT, product_image TEXT, category_name TEXT, price INTEGER, rocket_shipping INTEGER DEFAULT 0, free_shipping INTEGER DEFAULT 0, is_favorite INTEGER DEFAULT 0, deep_link TEXT, created_at TEXT, title TEXT, description TEXT, category TEXT, original_price REAL, discount_price REAL, image_url TEXT, status TEXT DEFAULT active);
CREATE TABLE coupang_crawl_queue (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  url TEXT NOT NULL,
  status TEXT DEFAULT 'pending',
  priority INTEGER DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now')),
  processed_at TEXT,
  error TEXT,
  result TEXT
);
DELETE FROM sqlite_sequence;
COMMIT;
