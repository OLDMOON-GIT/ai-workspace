@echo off
echo.
echo ========================================
echo    Morning Bug Report
echo    %date% %time%
echo ========================================
echo.

echo ----------------------------------------
echo  ERROR QUEUE STATUS
echo ----------------------------------------
cd /d "C:\Users\oldmoon\workspace\mcp-debugger"
npm run worker -- stats
echo.

echo ----------------------------------------
echo  PENDING ERRORS (need attention)
echo ----------------------------------------
npm run worker -- list 20
echo.

echo ----------------------------------------
echo  TEST RESULTS
echo ----------------------------------------
cd /d "C:\Users\oldmoon\workspace\mcp-auto-tester"
npm run cli -- stats
echo.

echo ----------------------------------------
echo  RECENT TEST RUNS
echo ----------------------------------------
npm run cli -- history
echo.

echo ----------------------------------------
echo  FAILED TESTS
echo ----------------------------------------
npm run cli -- failed
echo.

echo ========================================
echo  Report Complete!
echo ========================================
pause
