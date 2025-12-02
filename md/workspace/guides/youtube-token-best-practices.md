# YouTube API 토큰 관리 베스트 프랙티스

## 📋 핵심 요약

### 토큰 만료 정책

| 상태 | 리프레시 토큰 수명 | 조건 |
|------|-------------------|------|
| **Testing** | **7일** | OAuth 동의 화면이 "Testing" 상태 |
| **Production** | **무제한*** | OAuth 동의 화면이 "Production" 상태 |

*프로덕션에서도 다음 경우 만료:
- 6개월간 미사용
- 사용자의 액세스 취소
- 계정당 50개 토큰 제한 초과
- 조직 세션 정책 적용

### 액세스 토큰 vs 리프레시 토큰

| 구분 | 액세스 토큰 | 리프레시 토큰 |
|------|------------|--------------|
| 수명 | 1시간 | 조건부 무제한 |
| 용도 | API 호출 | 액세스 토큰 갱신 |
| 갱신 | 리프레시 토큰 사용 | 재인증 필요 |

## 🛡️ 토큰 만료 방지 전략

### 1. Production 상태 설정 (최우선)
```
Google Cloud Console → APIs & Services → OAuth consent screen
→ Publishing status를 "Production"으로 변경
```

### 2. 자동 갱신 구현
- **액세스 토큰**: 만료 5분 전 자동 갱신
- **주기**: 50분마다 체크 (1시간 만료 기준)
- **방식**: 리프레시 토큰으로 갱신

### 3. 6개월 미사용 방지
- **헬스 체크**: 주 1회 간단한 API 호출
- **목적**: last_used 타임스탬프 갱신
- **API**: `channels.list(mine=true)`

### 4. 토큰 제한 관리
- **제한**: 계정당 클라이언트 ID당 50개
- **대책**: 불필요한 토큰 정리
- **주의**: 새 토큰 발급 시 오래된 토큰 자동 무효화

## 💻 구현 체크리스트

### 초기 설정
- [ ] OAuth 동의 화면을 Production으로 설정
- [ ] 리프레시 토큰 받기: `access_type='offline'`
- [ ] 리프레시 토큰 재발급: `prompt='consent'`

### 토큰 저장
- [ ] 리프레시 토큰 암호화 저장
- [ ] 토큰 파일에 타임스탬프 추가
- [ ] last_used 필드 관리

### 자동 갱신
- [ ] 액세스 토큰 만료 시간 체크
- [ ] 만료 5분 전 갱신 로직
- [ ] 50분 간격 스케줄러

### 에러 처리
- [ ] 401 에러 → 토큰 갱신
- [ ] invalid_grant → 재인증 요청
- [ ] 토큰 갱신 실패 시 사용자 알림

### 모니터링
- [ ] 주간 헬스 체크 스케줄
- [ ] 토큰 상태 API 엔드포인트
- [ ] 갱신 실패 로깅

## 🚨 주의사항

### 하지 말아야 할 것
- ❌ 매일 Ping 보내기 (불필요)
- ❌ Testing 상태로 운영
- ❌ 리프레시 토큰 없이 운영
- ❌ 토큰 평문 저장

### 반드시 해야 할 것
- ✅ Production 상태 유지
- ✅ 리프레시 토큰 안전하게 저장
- ✅ 자동 갱신 로직 구현
- ✅ 에러 처리 및 재인증 플로우

## 📚 구현 파일

1. **Node.js**: `youtube-token-manager.js`
   - googleapis 라이브러리 사용
   - 자동 갱신 스케줄러
   - Express 통합 예제

2. **Python**: `youtube-token-manager.py`
   - google-auth 라이브러리 사용
   - 스레드 기반 자동 갱신
   - Flask 통합 예제

## 🔗 참고 자료

- [YouTube Data API Authentication Guide](https://developers.google.com/youtube/v3/guides/authentication)
- [OAuth 2.0 Best Practices](https://developers.google.com/identity/protocols/oauth2/resources/best-practices)
- [Google OAuth2 Token Expiration](https://stackoverflow.com/questions/8953983/do-google-refresh-tokens-expire)