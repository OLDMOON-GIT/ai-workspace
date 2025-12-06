import sys
sys.stdout.reconfigure(encoding='utf-8')

file_path = r"C:\Users\oldmoon\workspace\trend-video-frontend\src\lib\content.ts"

with open(file_path, 'r', encoding='utf-8') as f:
    content = f.read()

# Fix: Change status logic to use only 3 states (draft, script, video)
old_text = "options?.youtubeUrl ? 'completed' : (options?.videoPath ? 'video'"
new_text = "(options?.videoPath || options?.youtubeUrl) ? 'video'"

if old_text in content:
    content = content.replace(old_text, new_text)
    print("[OK] Fixed status logic: completed -> video")
else:
    print("[SKIP] Already fixed or pattern not found")

# Also update the comment
old_comment = "draft -> script -> video -> completed"
new_comment = "draft -> script -> video (3 states only)"

if old_comment in content:
    content = content.replace(old_comment, new_comment)
    print("[OK] Fixed comment")

with open(file_path, 'w', encoding='utf-8') as f:
    f.write(content)

print("[DONE] content.ts fixed!")
