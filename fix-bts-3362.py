import sys
sys.stdout.reconfigure(encoding='utf-8')

file_path = r"C:\Users\oldmoon\workspace\trend-video-frontend\src\app\api\tasks\[id]\convert-to-shorts\route.ts"

with open(file_path, 'r', encoding='utf-8') as f:
    content = f.read()

# Fix 1: Table name contents -> content, column id -> content_id
old_text = "SELECT *, id as contentId FROM contents WHERE id = ?"
new_text = "SELECT *, content_id as contentId FROM content WHERE content_id = ?"

if old_text in content:
    content = content.replace(old_text, new_text)
    print("[OK] Fixed SQL query")
else:
    print("[SKIP] SQL already fixed or not found")

# Fix 2: Update comment
old_comment = "// contents"
new_comment = "// content"

if old_comment in content:
    content = content.replace(old_comment, new_comment)
    print("[OK] Fixed comments")

with open(file_path, 'w', encoding='utf-8') as f:
    f.write(content)

print("[DONE] File saved!")
