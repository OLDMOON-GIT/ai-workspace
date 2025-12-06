SELECT
  CASE
    WHEN q.status = 'failed' THEN 'failed'
    WHEN q.status = 'completed' THEN 'completed'
    WHEN q.status = 'cancelled' THEN 'cancelled'
    ELSE q.type
  END as tab,
  COUNT(*) as count
FROM task_queue q
GROUP BY tab;
