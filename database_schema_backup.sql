CREATE TABLE users (
  id TEXT PRIMARY KEY,
  email TEXT UNIQUE NOT NULL,
  password TEXT NOT NULL,
  is_admin INTEGER DEFAULT 0,
  credits INTEGER DEFAULT 0,
  is_email_verified INTEGER DEFAULT 0,
  verification_token TEXT,
  memo TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
, google_sites_url TEXT, nickname TEXT, google_sites_edit_url TEXT, google_sites_home_url TEXT);
CREATE INDEX idx_users_email ON users(email);
CREATE INDEX idx_users_verification_token ON users(verification_token);
CREATE TABLE sessions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  created_at TEXT DEFAULT (datetime('now')),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);
CREATE INDEX idx_sessions_user_id ON sessions(user_id);
CREATE INDEX idx_sessions_expires_at ON sessions(expires_at);
CREATE TABLE jobs (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  status TEXT DEFAULT 'pending',
  progress INTEGER DEFAULT 0,
  step TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now')),
  title TEXT,
  video_url TEXT,
  error TEXT, thumbnail_path TEXT, video_path TEXT, logs TEXT, folder_id TEXT REFERENCES folders(id) ON DELETE SET NULL, type TEXT, source_content_id TEXT, converted_from_job_id TEXT, tts_voice TEXT, category TEXT,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);
CREATE INDEX idx_jobs_user_id ON jobs(user_id);
CREATE INDEX idx_jobs_status ON jobs(status);
CREATE INDEX idx_jobs_created_at ON jobs(created_at);
CREATE TABLE job_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  job_id TEXT NOT NULL,
  log_message TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  FOREIGN KEY (job_id) REFERENCES jobs(id) ON DELETE CASCADE
);
CREATE TABLE sqlite_sequence(name,seq);
CREATE INDEX idx_job_logs_job_id ON job_logs(job_id);
CREATE TABLE scripts (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  title TEXT NOT NULL,
  content TEXT,
  status TEXT DEFAULT 'completed',
  progress INTEGER DEFAULT 100,
  error TEXT,
  input_tokens INTEGER,
  output_tokens INTEGER,
  original_topic TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now')), type TEXT, folder_id TEXT REFERENCES folders(id) ON DELETE SET NULL, product_info TEXT,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);
CREATE INDEX idx_scripts_user_id ON scripts(user_id);
CREATE INDEX idx_scripts_status ON scripts(status);
CREATE INDEX idx_scripts_created_at ON scripts(created_at);
CREATE TABLE script_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  script_id TEXT NOT NULL,
  log_message TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  FOREIGN KEY (script_id) REFERENCES scripts(id) ON DELETE CASCADE
);
CREATE INDEX idx_script_logs_script_id ON script_logs(script_id);
CREATE TABLE credit_history (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  amount INTEGER NOT NULL,
  type TEXT NOT NULL,
  description TEXT,
  balance_after INTEGER NOT NULL,
  created_at TEXT DEFAULT (datetime('now')),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);
CREATE INDEX idx_credit_history_user_id ON credit_history(user_id);
CREATE INDEX idx_credit_history_created_at ON credit_history(created_at);
CREATE TABLE charge_requests (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  amount INTEGER NOT NULL,
  status TEXT DEFAULT 'pending',
  created_at TEXT DEFAULT (datetime('now')),
  processed_at TEXT,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);
CREATE INDEX idx_charge_requests_user_id ON charge_requests(user_id);
CREATE INDEX idx_charge_requests_status ON charge_requests(status);
CREATE TABLE settings (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ai_script_cost INTEGER DEFAULT 25,
  video_generation_cost INTEGER DEFAULT 50,
  updated_at TEXT DEFAULT (datetime('now'))
);
CREATE TABLE user_activity_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id TEXT NOT NULL,
  action TEXT NOT NULL,
  details TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);
CREATE INDEX idx_user_activity_logs_user_id ON user_activity_logs(user_id);
CREATE INDEX idx_user_activity_logs_created_at ON user_activity_logs(created_at);
CREATE TABLE tasks (
  id TEXT PRIMARY KEY,
  content TEXT NOT NULL,
  status TEXT DEFAULT 'todo' CHECK(status IN ('todo', 'ing', 'done')),
  priority INTEGER DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now')),
  completed_at TEXT
, logs TEXT);
CREATE INDEX idx_tasks_status ON tasks(status);
CREATE INDEX idx_tasks_priority ON tasks(priority);
CREATE INDEX idx_tasks_created_at ON tasks(created_at);
CREATE TABLE task_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  task_id TEXT NOT NULL,
  log_message TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE CASCADE
);
CREATE INDEX idx_task_logs_task_id ON task_logs(task_id);
CREATE TABLE scripts_temp (
        id TEXT PRIMARY KEY,
        title TEXT NOT NULL,
        status TEXT DEFAULT 'PENDING',
        message TEXT,
        createdAt TEXT NOT NULL,
        scriptId TEXT,
        logs TEXT DEFAULT '[]'
      , type TEXT, pid INTEGER, useClaudeLocal INTEGER DEFAULT 1, originalTitle TEXT, model TEXT DEFAULT 'claude');
CREATE TABLE folders (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  name TEXT NOT NULL,
  color TEXT DEFAULT '#8B5CF6',
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now')),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);
CREATE INDEX idx_folders_user_id ON folders(user_id);
CREATE INDEX idx_jobs_folder_id ON jobs(folder_id);
CREATE INDEX idx_scripts_folder_id ON scripts(folder_id);
CREATE TABLE youtube_uploads (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  job_id TEXT,
  video_id TEXT NOT NULL,
  video_url TEXT NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  thumbnail_url TEXT,
  channel_id TEXT NOT NULL,
  channel_title TEXT,
  privacy_status TEXT,
  published_at TEXT DEFAULT (datetime('now')),
  created_at TEXT DEFAULT (datetime('now')),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);
CREATE INDEX idx_youtube_uploads_user_id ON youtube_uploads(user_id);
CREATE INDEX idx_youtube_uploads_video_id ON youtube_uploads(video_id);
CREATE INDEX idx_youtube_uploads_published_at ON youtube_uploads(published_at);
CREATE TABLE content_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  content_id TEXT NOT NULL,
  log_message TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  FOREIGN KEY (content_id) REFERENCES contents(id) ON DELETE CASCADE
);
CREATE INDEX idx_content_logs_content_id ON content_logs(content_id);
CREATE TABLE chinese_converter_jobs (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  status TEXT DEFAULT 'pending',
  progress INTEGER DEFAULT 0,
  video_path TEXT,
  output_path TEXT,
  error TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now')), title TEXT,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);
CREATE INDEX idx_chinese_converter_jobs_user_id ON chinese_converter_jobs(user_id);
CREATE INDEX idx_chinese_converter_jobs_status ON chinese_converter_jobs(status);
CREATE INDEX idx_chinese_converter_jobs_created_at ON chinese_converter_jobs(created_at);
CREATE TABLE chinese_converter_job_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  job_id TEXT NOT NULL,
  log_message TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  FOREIGN KEY (job_id) REFERENCES chinese_converter_jobs(id) ON DELETE CASCADE
);
CREATE INDEX idx_chinese_converter_job_logs_job_id ON chinese_converter_job_logs(job_id);
CREATE TABLE wordpress_settings (
        user_id TEXT PRIMARY KEY,
        site_url TEXT NOT NULL,
        username TEXT NOT NULL,
        app_password TEXT NOT NULL,
        created_at TEXT DEFAULT (datetime('now')),
        updated_at TEXT DEFAULT (datetime('now')),
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
      );
CREATE TABLE wordpress_oauth_tokens (
        user_id TEXT PRIMARY KEY,
        access_token TEXT NOT NULL,
        blog_id TEXT NOT NULL,
        blog_url TEXT NOT NULL,
        created_at TEXT DEFAULT (datetime('now')),
        updated_at TEXT DEFAULT (datetime('now')),
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
      );
CREATE TABLE coupang_products (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        product_url TEXT NOT NULL,
        deep_link TEXT NOT NULL,
        title TEXT NOT NULL,
        description TEXT,
        category TEXT NOT NULL,
        original_price REAL,
        discount_price REAL,
        image_url TEXT,
        status TEXT DEFAULT 'active',
        view_count INTEGER DEFAULT 0,
        click_count INTEGER DEFAULT 0,
        created_at TEXT DEFAULT (datetime('now')),
        updated_at TEXT DEFAULT (datetime('now')), queue_id TEXT, is_favorite INTEGER DEFAULT 0,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
      );
CREATE INDEX idx_coupang_products_category ON coupang_products(category);
CREATE INDEX idx_coupang_products_status ON coupang_products(status);
CREATE INDEX idx_coupang_products_user_id ON coupang_products(user_id);
CREATE TABLE pending_products (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        source_url TEXT NOT NULL,
        product_url TEXT NOT NULL,
        title TEXT,
        description TEXT,
        image_url TEXT,
        original_price INTEGER,
        discount_price INTEGER,
        category TEXT,
        status TEXT DEFAULT 'pending',
        notes TEXT,
        video_ready BOOLEAN DEFAULT 0,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      , crawl_status TEXT DEFAULT 'pending');
CREATE INDEX idx_pending_products_user_id ON pending_products(user_id);
CREATE INDEX idx_pending_products_status ON pending_products(status);
CREATE INDEX idx_pending_products_video_ready ON pending_products(video_ready);
CREATE TABLE crawled_product_links (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        product_url TEXT NOT NULL,
        source_url TEXT NOT NULL,
        title TEXT,
        description TEXT,
        category TEXT,
        image_url TEXT,
        created_at TEXT DEFAULT (datetime('now')), original_price REAL, discount_price REAL,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
      );
CREATE TABLE crawl_link_history (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        source_url TEXT NOT NULL,
        hostname TEXT,
        last_result_count INTEGER DEFAULT 0,
        last_duplicate_count INTEGER DEFAULT 0,
        last_error_count INTEGER DEFAULT 0,
        last_total_links INTEGER DEFAULT 0,
        last_status TEXT DEFAULT 'pending',
        last_message TEXT,
        last_job_id TEXT,
        last_crawled_at TEXT DEFAULT (datetime('now')),
        created_at TEXT DEFAULT (datetime('now')),
        updated_at TEXT DEFAULT (datetime('now')),
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
      );
CREATE UNIQUE INDEX idx_crawl_link_history_user_source ON crawl_link_history(user_id, source_url);
CREATE INDEX idx_crawl_link_history_last_crawled ON crawl_link_history(last_crawled_at);
CREATE TABLE shop_versions (
        id TEXT PRIMARY KEY,
        version_number INTEGER,
        name TEXT,
        description TEXT,
        data TEXT NOT NULL,
        total_products INTEGER DEFAULT 0,
        is_published INTEGER DEFAULT 0,
        created_at TEXT DEFAULT (datetime('now')),
        updated_at TEXT DEFAULT (datetime('now')),
        published_at TEXT
      , git_commit_hash TEXT);
CREATE INDEX idx_shop_versions_created_at ON shop_versions(created_at);
CREATE INDEX idx_shop_versions_published ON shop_versions(is_published, published_at);
CREATE TABLE coupang_crawl_queue (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  product_url TEXT NOT NULL,
  status TEXT DEFAULT 'pending',  -- pending, processing, done, failed
  retry_count INTEGER DEFAULT 0,
  max_retries INTEGER DEFAULT 3,
  timeout_seconds INTEGER DEFAULT 60,  -- 첫 시도는 60초
  error_message TEXT,
  product_info TEXT,  -- JSON 형태로 크롤링된 정보 저장
  custom_category TEXT,  -- 사용자 지정 카테고리
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now')),
  processed_at TEXT, destination TEXT DEFAULT 'my_list', source_url TEXT,  -- 처리 완료 시간
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);
CREATE INDEX idx_coupang_crawl_queue_user_id ON coupang_crawl_queue(user_id);
CREATE INDEX idx_coupang_crawl_queue_status ON coupang_crawl_queue(status);
CREATE INDEX idx_coupang_crawl_queue_created_at ON coupang_crawl_queue(created_at);
CREATE INDEX idx_coupang_products_queue_id ON coupang_products(queue_id);
CREATE TABLE social_media_accounts (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        platform TEXT NOT NULL CHECK(platform IN ('tiktok', 'instagram', 'facebook')),
        account_id TEXT NOT NULL,
        username TEXT,
        display_name TEXT,
        profile_picture TEXT,
        follower_count INTEGER DEFAULT 0,
        access_token TEXT NOT NULL,
        refresh_token TEXT,
        token_expires_at TEXT,
        is_default INTEGER DEFAULT 0,
        created_at TEXT DEFAULT (datetime('now')),
        updated_at TEXT DEFAULT (datetime('now')),
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
        UNIQUE(user_id, platform, account_id)
      );
CREATE INDEX idx_social_media_accounts_user_id ON social_media_accounts(user_id);
CREATE INDEX idx_social_media_accounts_platform ON social_media_accounts(platform);
CREATE TABLE social_media_uploads (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        job_id TEXT,
        platform TEXT NOT NULL CHECK(platform IN ('tiktok', 'instagram', 'facebook')),
        post_id TEXT NOT NULL,
        post_url TEXT,
        title TEXT,
        description TEXT,
        thumbnail_url TEXT,
        account_id TEXT NOT NULL,
        account_username TEXT,
        privacy_status TEXT,
        published_at TEXT DEFAULT (datetime('now')),
        created_at TEXT DEFAULT (datetime('now')),
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
        FOREIGN KEY (account_id) REFERENCES social_media_accounts(id) ON DELETE CASCADE
      );
CREATE INDEX idx_social_media_uploads_user_id ON social_media_uploads(user_id);
CREATE INDEX idx_social_media_uploads_platform ON social_media_uploads(platform);
CREATE INDEX idx_jobs_source_content_id ON jobs(source_content_id);
CREATE TABLE contents (
          id TEXT PRIMARY KEY,
          user_id TEXT NOT NULL,
          type TEXT NOT NULL CHECK(type IN ('script', 'video')),
          format TEXT CHECK(format IN ('longform', 'shortform', 'sora2', 'product', 'product-info')),
          title TEXT NOT NULL,
          original_title TEXT,
          content TEXT,
          status TEXT DEFAULT 'pending' CHECK(status IN ('pending', 'processing', 'completed', 'failed')),
          progress INTEGER DEFAULT 0,
          error TEXT,
          pid INTEGER,
          video_path TEXT,
          thumbnail_path TEXT,
          published INTEGER DEFAULT 0,
          published_at TEXT,
          input_tokens INTEGER,
          output_tokens INTEGER,
          use_claude_local INTEGER DEFAULT 0,
          source_content_id TEXT,
          conversion_type TEXT,
          is_regenerated INTEGER DEFAULT 0,
          created_at TEXT DEFAULT (datetime('now')),
          updated_at TEXT DEFAULT (datetime('now')), model TEXT, product_info TEXT, category TEXT,
          FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
        );
CREATE INDEX idx_contents_user_id ON contents(user_id);
CREATE INDEX idx_contents_type ON contents(type);
CREATE INDEX idx_contents_format ON contents(format);
CREATE INDEX idx_contents_status ON contents(status);
CREATE INDEX idx_contents_created_at ON contents(created_at);
CREATE INDEX idx_contents_published ON contents(published);
CREATE TABLE automation_settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL,
      description TEXT,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
CREATE TABLE automation_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    pipeline_id TEXT NOT NULL,
    log_level TEXT NOT NULL CHECK(log_level IN ('info', 'warn', 'error', 'debug')),
    old_message TEXT,
    metadata TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    title_id TEXT,
    level TEXT DEFAULT 'info',
    details TEXT
  , message TEXT);
CREATE TABLE title_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title_id TEXT NOT NULL,
      level TEXT NOT NULL CHECK(level IN ('info', 'warn', 'error', 'debug')),
      message TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (title_id) REFERENCES video_titles(id) ON DELETE CASCADE
    );
CREATE TABLE youtube_channel_settings (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      channel_id TEXT NOT NULL,
      channel_name TEXT NOT NULL,
      color TEXT DEFAULT '#3b82f6',
      posting_mode TEXT DEFAULT 'fixed_interval' CHECK(posting_mode IN ('fixed_interval', 'weekday_time')),
      interval_value INTEGER,
      interval_unit TEXT CHECK(interval_unit IN ('hours', 'days')),
      weekdays TEXT,
      posting_time TEXT,
      is_active INTEGER DEFAULT 1,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP, categories TEXT, weekday_times TEXT,
      UNIQUE(user_id, channel_id)
    );
CREATE TABLE api_costs (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        cost_type TEXT NOT NULL CHECK(cost_type IN ('ai_script', 'image_generation', 'tts', 'video_generation')),
        service_name TEXT NOT NULL,
        amount REAL NOT NULL,
        credits_deducted INTEGER,
        content_id TEXT,
        metadata TEXT,
        created_at TEXT DEFAULT (datetime('now')),
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
      );
CREATE INDEX idx_api_costs_user_id ON api_costs(user_id);
CREATE INDEX idx_api_costs_cost_type ON api_costs(cost_type);
CREATE INDEX idx_api_costs_created_at ON api_costs(created_at);
CREATE TABLE video_schedules (
  id TEXT PRIMARY KEY,
  title_id TEXT NOT NULL,
  scheduled_time DATETIME NOT NULL,
  youtube_publish_time DATETIME,
  status TEXT DEFAULT 'pending' CHECK(status IN ('pending', 'processing', 'completed', 'failed', 'cancelled', 'waiting_for_upload')),
  script_id TEXT,
  video_id TEXT,
  youtube_upload_id TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP, youtube_url TEXT, youtube_privacy TEXT DEFAULT 'public', shortform_job_id TEXT, shortform_uploaded INTEGER DEFAULT 0, longform_youtube_url TEXT, media_mode TEXT DEFAULT 'upload', channel_setting_id TEXT, image_queue_task_id TEXT, task_id TEXT,
  FOREIGN KEY (title_id) REFERENCES video_titles(id) ON DELETE CASCADE
);
CREATE TABLE video_titles (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      type TEXT NOT NULL CHECK(type IN ('shortform', 'longform', 'product', 'product-info', 'sora2')),
      category TEXT,
      tags TEXT,
      product_url TEXT,
      status TEXT DEFAULT 'pending' CHECK(status IN ('pending', 'scheduled', 'processing', 'completed', 'failed', 'waiting_for_upload')),
      priority INTEGER DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      channel TEXT,
      script_mode TEXT DEFAULT 'chrome',
      media_mode TEXT DEFAULT 'dalle3',
      youtube_schedule TEXT DEFAULT 'immediate',
      user_id TEXT,
      model TEXT DEFAULT 'claude',
      product_data TEXT
    );
CREATE TABLE video_categories (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      name TEXT NOT NULL,
      description TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(user_id, name)
    );
CREATE TABLE auto_generation_logs (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      channel_id TEXT NOT NULL,
      channel_name TEXT NOT NULL,
      category TEXT NOT NULL,
      status TEXT DEFAULT 'started' CHECK(status IN ('started', 'fetching', 'generating', 'evaluating', 'completed', 'failed')),
      step TEXT,
      models_used TEXT,
      titles_generated TEXT,
      best_title TEXT,
      best_score REAL,
      result_title_id TEXT,
      product_info TEXT,
      error_message TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      completed_at DATETIME
    );
CREATE INDEX idx_auto_gen_logs_user_status ON auto_generation_logs(user_id, status);
CREATE INDEX idx_auto_gen_logs_created ON auto_generation_logs(created_at DESC);
CREATE TABLE title_pool (
      id TEXT PRIMARY KEY,
      category TEXT NOT NULL,
      title TEXT NOT NULL,
      score INTEGER NOT NULL,
      validated INTEGER DEFAULT 0,
      used INTEGER DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(category, title)
    );
CREATE INDEX idx_title_pool_category_score ON title_pool(category, score DESC, used ASC);
CREATE INDEX idx_coupang_products_user_status ON coupang_products(user_id, status);
CREATE TABLE queue_tasks (
      id TEXT PRIMARY KEY,
      type TEXT NOT NULL CHECK(type IN ('script', 'image', 'video')),
      status TEXT NOT NULL CHECK(status IN ('waiting', 'processing', 'completed', 'failed')),
      priority INTEGER DEFAULT 0,
      created_at TEXT NOT NULL,
      started_at TEXT,
      completed_at TEXT,
      user_id TEXT NOT NULL,
      project_id TEXT NOT NULL,
      metadata TEXT,
      logs TEXT,
      error TEXT,
      retry_count INTEGER DEFAULT 0,
      max_retries INTEGER DEFAULT 3
    );
CREATE TABLE queue_locks (
      task_type TEXT PRIMARY KEY CHECK(task_type IN ('script', 'image', 'video')),
      locked_by TEXT,
      locked_at TEXT,
      worker_pid INTEGER
    );
CREATE INDEX idx_queue_tasks_status ON queue_tasks(status);
CREATE INDEX idx_queue_tasks_type ON queue_tasks(type);
CREATE INDEX idx_queue_tasks_created ON queue_tasks(created_at);
CREATE TABLE tasks_queue (
      task_id TEXT NOT NULL,
      type TEXT NOT NULL CHECK(type IN ('script', 'image', 'video', 'youtube')),
      status TEXT NOT NULL CHECK(status IN ('waiting', 'processing', 'completed', 'failed')),
      priority INTEGER DEFAULT 0,
      created_at TEXT NOT NULL,
      started_at TEXT,
      completed_at TEXT,
      user_id TEXT,
      metadata TEXT,
      logs TEXT,
      error TEXT,
      retry_count INTEGER DEFAULT 0,
      max_retries INTEGER DEFAULT 3,
      PRIMARY KEY (task_id, type)
    );
CREATE TABLE tasks_locks (
      task_type TEXT PRIMARY KEY CHECK(task_type IN ('script', 'image', 'video', 'youtube')),
      locked_by TEXT,
      locked_at TEXT,
      worker_pid INTEGER
    );
CREATE TABLE IF NOT EXISTS "task_schedules_old" (
  id TEXT PRIMARY KEY,
  task_id TEXT,
  title_id TEXT NOT NULL,
  user_id TEXT,
  scheduled_time DATETIME NOT NULL,
  youtube_publish_time DATETIME,
  youtube_privacy TEXT DEFAULT 'public',
  youtube_url TEXT,
  channel_setting_id TEXT,
  media_mode TEXT DEFAULT 'upload',
  status TEXT DEFAULT 'pending',
  script_id TEXT,
  video_id TEXT,
  youtube_upload_id TEXT,
  error TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP, shortform_uploaded INTEGER DEFAULT 0, parent_youtube_url TEXT, shortform_task_id TEXT,
  FOREIGN KEY (title_id) REFERENCES video_titles(id) ON DELETE CASCADE
);
CREATE INDEX idx_task_schedules_task_id ON "task_schedules_old"(task_id);
CREATE INDEX idx_task_schedules_status ON "task_schedules_old"(status);
CREATE INDEX idx_task_schedules_title_id ON "task_schedules_old"(title_id);
CREATE TABLE automation_tasks (
    task_id TEXT PRIMARY KEY,
    user_id TEXT,
    title_id TEXT,
    title TEXT NOT NULL,
    type TEXT NOT NULL CHECK(type IN ('shortform', 'longform', 'product', 'product-info', 'sora2')),
    category TEXT,
    tags TEXT,
    product_url TEXT,
    product_data TEXT,
    channel TEXT,
    script_mode TEXT DEFAULT 'chrome',
    media_mode TEXT DEFAULT 'upload',
    model TEXT DEFAULT 'claude',
    youtube_schedule TEXT DEFAULT 'immediate',
    status TEXT DEFAULT 'pending' CHECK(status IN ('pending', 'processing', 'completed', 'failed', 'cancelled', 'waiting_for_upload')),
    script_id TEXT,
    video_id TEXT,
    error TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );
CREATE INDEX idx_automation_tasks_status ON automation_tasks(status);
CREATE INDEX idx_automation_tasks_user_id ON automation_tasks(user_id);
CREATE INDEX idx_automation_tasks_title_id ON automation_tasks(title_id);
CREATE TABLE IF NOT EXISTS "task_schedules_broken_backup" (
    task_id TEXT NOT NULL,
    schedule_id TEXT NOT NULL,
    scheduled_time DATETIME NOT NULL,
    youtube_publish_time DATETIME,
    youtube_privacy TEXT DEFAULT 'public',
    youtube_url TEXT,
    channel_setting_id TEXT,
    youtube_upload_id TEXT,
    shortform_task_id TEXT,
    shortform_uploaded INTEGER DEFAULT 0,
    parent_youtube_url TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (task_id, schedule_id),
    FOREIGN KEY (task_id) REFERENCES automation_tasks(task_id) ON DELETE CASCADE
  );
CREATE INDEX idx_task_schedules_scheduled_time ON "task_schedules_broken_backup"(scheduled_time);
CREATE TABLE task_schedules (
      id TEXT PRIMARY KEY,
      task_id TEXT,
      title_id TEXT NOT NULL,
      user_id TEXT,
      scheduled_time DATETIME NOT NULL,
      youtube_publish_time DATETIME,
      youtube_privacy TEXT DEFAULT 'public',
      youtube_url TEXT,
      channel_setting_id TEXT,
      media_mode TEXT DEFAULT 'upload',
      status TEXT DEFAULT 'pending' CHECK(status IN ('pending', 'processing', 'completed', 'failed', 'cancelled', 'waiting_for_upload')),
      script_id TEXT,
      video_id TEXT,
      youtube_upload_id TEXT,
      error TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP, shortform_task_id TEXT, parent_youtube_url TEXT, shortform_uploaded INTEGER DEFAULT 0,
      FOREIGN KEY (title_id) REFERENCES video_titles(id) ON DELETE CASCADE
    );
