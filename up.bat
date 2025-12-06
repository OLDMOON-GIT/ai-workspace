@echo off
echo [1/2] 서브모듈(하위폴더) 저장 중...
git submodule foreach --recursive "git add . && git commit -allow-empty -m 'submodule-update' && git push origin master"

echo [2/2] 메인 프로젝트 저장 중...
git add .
git commit -allow-empty -m "main-project-update"
git push origin master
pause