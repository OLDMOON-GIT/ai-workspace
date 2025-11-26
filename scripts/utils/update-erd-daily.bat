@echo off
REM 아키텍처 문서 자동 업데이트 배치 스크립트
REM Windows Task Scheduler에서 매일 새벽 6시 실행

cd /d C:\Users\oldmoon\workspace
node scripts\utils\update-architecture-docs.js >> logs\architecture-update.log 2>&1

REM 로그 파일이 너무 크면 정리 (10MB 이상)
FOR %%A IN (logs\erd-update.log) DO (
    IF %%~zA GTR 10485760 (
        echo Log file too large, rotating...
        move /Y logs\erd-update.log logs\erd-update.log.old
    )
)

exit /b 0
