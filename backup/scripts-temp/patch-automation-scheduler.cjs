const fs = require('fs');
const filePath = 'C:/Users/oldmoon/workspace/trend-video-frontend/src/lib/automation-scheduler.ts';
let content = fs.readFileSync(filePath, 'utf-8');

// 주석 블록을 찾아서 새 코드로 교체
const oldPattern = `    console.log(\`✅ [Pipeline] Successfully completed for queue \${queue.id}\`);

    // ============================================================
    // ⚠️ DISABLED: 롱폼 완료 후 숏폼 자동 생성
    // - shortform_task_id, parent_youtube_url 컬럼이 task_schedule 테이블에서 제거됨 (cleanup-task-schedule.js)
    // - 숏폼 관련 정보는 content 테이블로 이동 예정
    // ============================================================
    /*
    if (schedule.type === 'longform' && uploadResult.videoUrl) {
      console.log(\`🎬 [SHORTFORM] Longform completed, triggering shortform conversion...\`);
      addTitleLog(schedule.task_id, 'info', \`🎬 롱폼 완료! 숏폼 변환 시작...\`);

      try {
        // 롱폼 content_id (job_id) 가져오기
        const longformJobId = videoResult.videoId;
        const longformYoutubeUrl = uploadResult.videoUrl;

        console.log(\`🔍 [SHORTFORM] Longform job_id: \${longformJobId}, YouTube URL: \${longformYoutubeUrl}\`);

        // convert-to-shorts API 호출
        const convertResponse = await fetch(\`http://localhost:\${process.env.PORT || 3000}/api/jobs/\${longformJobId}/convert-to-shorts\`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-Internal-Request': 'automation-system',
            'X-User-Id': schedule.user_id // 인증 우회용
          }
        });

        if (!convertResponse.ok) {
          const errorText = await convertResponse.text();
          console.error(\`❌ [SHORTFORM] Conversion failed: \${errorText}\`);
          addTitleLog(schedule.task_id, 'warn', \`⚠️ 숏폼 변환 실패: \${errorText}\`);
        } else {
          const convertData = await convertResponse.json();
          const shortformJobId = convertData.taskId;

          console.log(\`✅ [SHORTFORM] Conversion started, shortform job_id: \${shortformJobId}\`);
          addTitleLog(schedule.task_id, 'info', \`✅ 숏폼 변환 시작됨 (작업 ID: \${shortformJobId})\`);

          // 숏폼 작업 ID와 롱폼 YouTube URL 저장 (나중에 업로드할 때 사용)
          // MySQL: use imported db
        }
      } catch (e: any) {
        console.error(\`❌ [SHORTFORM] Error:\`, e);
      }
    }
    */

  } catch (error: any) {`;

const newCode = `    console.log(\`✅ [Pipeline] Successfully completed for queue \${queue.id}\`);

    // ============================================================
    // BTS-14865: 롱폼 완료 후 숏폼 자동 생성 (autoCreateShortform 체크)
    // ============================================================
    const isLongform = queue.promptFormat === 'longform';
    const autoCreateShortform = queue.autoCreateShortform === 1 || queue.autoCreateShortform === true;
    console.log(\`🔍 [SHORTFORM CHECK] isLongform: \${isLongform}, autoCreateShortform: \${autoCreateShortform}\`);

    if (isLongform && autoCreateShortform && uploadResult?.videoUrl) {
      console.log(\`🎬 [SHORTFORM] Longform completed, triggering shortform conversion...\`);
      addTitleLog(queue.taskId, 'info', \`🎬 롱폼 완료! 숏폼 변환 시작...\`);

      try {
        const longformJobId = queue.taskId;
        const longformYoutubeUrl = uploadResult.videoUrl;

        console.log(\`🔍 [SHORTFORM] Longform taskId: \${longformJobId}, YouTube URL: \${longformYoutubeUrl}\`);

        const convertResponse = await fetch(\`http://localhost:\${process.env.PORT || 3000}/api/tasks/\${longformJobId}/convert-to-shorts\`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-Internal-Request': 'automation-system',
            'X-User-Id': queue.userId
          }
        });

        if (!convertResponse.ok) {
          const errorText = await convertResponse.text();
          console.error(\`❌ [SHORTFORM] Conversion failed: \${errorText}\`);
          addTitleLog(queue.taskId, 'warn', \`⚠️ 숏폼 변환 실패: \${errorText}\`);
        } else {
          const convertData = await convertResponse.json();
          const shortformJobId = convertData.taskId;
          console.log(\`✅ [SHORTFORM] Conversion started, shortform job_id: \${shortformJobId}\`);
          addTitleLog(queue.taskId, 'info', \`✅ 숏폼 변환 시작됨 (작업 ID: \${shortformJobId})\`);

          // 롱폼 YouTube URL을 숏폼 story.json에 저장
          setTimeout(async () => {
            try {
              const shortformStoryPath = path.join(process.cwd(), '..', 'trend-video-backend', 'tasks', shortformJobId, 'story.json');
              const storyContent = await fs.promises.readFile(shortformStoryPath, 'utf-8');
              const storyData = JSON.parse(storyContent);
              storyData.metadata = storyData.metadata || {};
              storyData.metadata.longform_youtube_url = longformYoutubeUrl;
              await fs.promises.writeFile(shortformStoryPath, JSON.stringify(storyData, null, 2), 'utf-8');
              console.log(\`✅ [SHORTFORM] longform_youtube_url saved to story.json\`);
            } catch (storyErr) {
              console.warn(\`⚠️ [SHORTFORM] Failed to save longform_youtube_url\`);
            }
          }, 5000);
        }
      } catch (e: any) {
        console.error(\`❌ [SHORTFORM] Error:\`, e);
        addTitleLog(queue.taskId, 'error', \`❌ 숏폼 변환 중 오류\`);
      }
    }

  } catch (error: any) {`;

if (content.includes('⚠️ DISABLED: 롱폼 완료 후 숏폼 자동 생성')) {
  content = content.replace(oldPattern, newCode);
  fs.writeFileSync(filePath, content, 'utf-8');
  console.log('✅ 파일 수정 완료 (BTS-14865: 롱폼투숏폼 자동 변환 활성화)');
} else {
  console.log('❌ 이미 수정되었거나 패턴을 찾을 수 없습니다');
}
