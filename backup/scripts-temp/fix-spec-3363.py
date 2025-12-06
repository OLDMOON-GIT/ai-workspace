import sys
sys.stdout.reconfigure(encoding='utf-8')

# Fix 1: my-scripts API - only show status='script'
file1 = r"C:\Users\oldmoon\workspace\trend-video-frontend\src\app\api\my-scripts\route.ts"

with open(file1, 'r', encoding='utf-8') as f:
    content = f.read()

old1 = """SELECT * FROM content
        WHERE user_id = ?
        ORDER BY created_at DESC"""

new1 = """SELECT * FROM content
        WHERE user_id = ? AND status = 'script'
        ORDER BY created_at DESC"""

if old1 in content:
    content = content.replace(old1, new1)
    with open(file1, 'w', encoding='utf-8') as f:
        f.write(content)
    print("[OK] Fixed my-scripts API: status='script' filter added")
else:
    print("[SKIP] my-scripts already fixed or pattern not found")

# Fix 2: db.ts getJobsByUserId - only show status='video'
file2 = r"C:\Users\oldmoon\workspace\trend-video-frontend\src\lib\db.ts"

with open(file2, 'r', encoding='utf-8') as f:
    content = f.read()

old2 = """FROM content c
    LEFT JOIN task_queue q ON c.content_id = q.task_id
    WHERE c.user_id = ?
    ORDER BY c.created_at DESC"""

new2 = """FROM content c
    LEFT JOIN task_queue q ON c.content_id = q.task_id
    WHERE c.user_id = ? AND c.status = 'video'
    ORDER BY c.created_at DESC"""

if old2 in content:
    content = content.replace(old2, new2)
    with open(file2, 'w', encoding='utf-8') as f:
        f.write(content)
    print("[OK] Fixed db.ts getJobsByUserId: status='video' filter added")
else:
    print("[SKIP] db.ts already fixed or pattern not found")

# Fix 3: my-scripts COUNT query
with open(file1, 'r', encoding='utf-8') as f:
    content = f.read()

old3 = """SELECT COUNT(*) as count FROM content
        WHERE user_id = ?"""

new3 = """SELECT COUNT(*) as count FROM content
        WHERE user_id = ? AND status = 'script'"""

if old3 in content:
    content = content.replace(old3, new3)
    with open(file1, 'w', encoding='utf-8') as f:
        f.write(content)
    print("[OK] Fixed my-scripts COUNT query")
else:
    print("[SKIP] COUNT query already fixed")

print("[DONE] SPEC-3363 API fixes completed!")
