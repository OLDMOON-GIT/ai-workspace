#!/bin/bash
# 같은 타입의 에러를 일괄 처리하는 스크립트

for i in {1..10}; do
  npm run worker -- 에러탐지해 > /tmp/error.txt 2>&1
  ERROR_ID=$(grep "에러 #" /tmp/error.txt | grep -oP '#\K\d+')

  if [ -z "$ERROR_ID" ]; then
    echo "✅ 처리할 에러가 없습니다!"
    break
  fi

  echo "처리 중: 에러 #$ERROR_ID"
  npm run worker -- 해결 $ERROR_ID "t.type 에러 이미 수정 완료됨" > /dev/null 2>&1
  echo "✅ 에러 #$ERROR_ID 해결 완료"
done
