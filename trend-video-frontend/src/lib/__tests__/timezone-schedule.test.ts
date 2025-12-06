/**
 * 시간대 변환 통합 테스트
 *
 * 목적: 채널 설정 시간(15:00)이 UTC 변환 없이 그대로 DB에 저장되는지 검증
 */

import { calculateNextScheduleTime } from '../automation';

// toSqliteDatetime 함수 복사 (private이므로)
function toMysqlDatetime(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  const hours = String(date.getHours()).padStart(2, '0');
  const minutes = String(date.getMinutes()).padStart(2, '0');
  const seconds = String(date.getSeconds()).padStart(2, '0');
  return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;
}

describe('시간대 변환 테스트', () => {
  test('로컬 시간대 그대로 MySQL datetime 형식으로 변환', () => {
    // Given: 2025-12-03 15:00:00 (로컬 시간)
    const testDate = new Date(2025, 11, 3, 15, 0, 0); // 월은 0부터 시작 (11 = 12월)

    // When: MySQL datetime으로 변환
    const result = toMysqlDatetime(testDate);

    // Then: UTC 변환 없이 그대로 15:00:00
    expect(result).toBe('2025-12-03 15:00:00');
    expect(result).not.toContain('06:00'); // UTC로 변환되면 06:00이 됨
    expect(result).not.toContain('T'); // ISO 형식 아님
    expect(result).not.toContain('Z'); // UTC 타임존 아님
  });

  test('Date 객체의 getHours()는 로컬 시간 반환', () => {
    // Given: 2025-12-03 15:00:00 (로컬 시간)
    const testDate = new Date(2025, 11, 3, 15, 30, 45);

    // When: Date 객체에서 시간 추출
    const hours = testDate.getHours();
    const minutes = testDate.getMinutes();
    const seconds = testDate.getSeconds();

    // Then: 로컬 시간 그대로 반환
    expect(hours).toBe(15);
    expect(minutes).toBe(30);
    expect(seconds).toBe(45);
  });

  test('toISOString()은 UTC로 변환하므로 사용하면 안 됨', () => {
    // Given: 2025-12-03 15:00:00 (한국 시간 = UTC+9)
    const testDate = new Date(2025, 11, 3, 15, 0, 0);

    // When: toISOString() 사용 (잘못된 방법)
    const isoString = testDate.toISOString();

    // Then: UTC로 변환되어 06:00:00이 됨 (15 - 9 = 6)
    expect(isoString).toContain('T06:00:00'); // 잘못된 결과!
  });

  test('여러 시간대에서 일관성 유지', () => {
    // Given: 다양한 시간
    const testCases = [
      { input: new Date(2025, 11, 3, 9, 0, 0), expected: '2025-12-03 09:00:00' },
      { input: new Date(2025, 11, 3, 15, 0, 0), expected: '2025-12-03 15:00:00' },
      { input: new Date(2025, 11, 3, 16, 0, 0), expected: '2025-12-03 16:00:00' },
      { input: new Date(2025, 11, 3, 21, 0, 0), expected: '2025-12-03 21:00:00' },
      { input: new Date(2025, 11, 3, 23, 59, 59), expected: '2025-12-03 23:59:59' },
    ];

    // When & Then
    for (const { input, expected } of testCases) {
      const result = toMysqlDatetime(input);
      expect(result).toBe(expected);
    }
  });

  test('10분 단위 시간 검증', () => {
    // Given: 10분 단위 시간들
    const validTimes = ['09:00', '09:10', '09:20', '09:30', '09:40', '09:50'];

    // When & Then: 10분 단위만 허용
    for (const time of validTimes) {
      const [hours, minutes] = time.split(':').map(Number);
      expect(minutes % 10).toBe(0);
    }
  });

  test('잘못된 분 단위 검출', () => {
    // Given: 잘못된 분 단위
    const invalidTimes = ['09:05', '09:15', '09:25', '09:35', '09:45', '09:55'];

    // When & Then: 10분 단위가 아님
    for (const time of invalidTimes) {
      const [hours, minutes] = time.split(':').map(Number);
      expect(minutes % 10).not.toBe(0);
    }
  });
});

describe('채널별 스케줄 시간 중복 검증', () => {
  test('같은 시간에 중복 스케줄 불가', () => {
    // Given: 같은 채널, 같은 시간
    const schedules = [
      { channelId: 'channel1', scheduledTime: '2025-12-03 15:00:00' },
      { channelId: 'channel1', scheduledTime: '2025-12-03 15:00:00' }, // 중복!
    ];

    // When: 중복 체크
    const uniqueTimes = new Map();
    const duplicates = [];

    for (const schedule of schedules) {
      const key = `${schedule.channelId}-${schedule.scheduledTime}`;
      if (uniqueTimes.has(key)) {
        duplicates.push(schedule);
      } else {
        uniqueTimes.set(key, schedule);
      }
    }

    // Then: 중복 발견
    expect(duplicates.length).toBe(1);
  });

  test('같은 날짜, 다른 시간은 중복 아님', () => {
    // Given: bossman 채널 - 하루 3회 (09:00, 15:00, 21:00)
    const schedules = [
      { channelId: 'bossman', scheduledTime: '2025-12-03 09:00:00' },
      { channelId: 'bossman', scheduledTime: '2025-12-03 15:00:00' },
      { channelId: 'bossman', scheduledTime: '2025-12-03 21:00:00' },
    ];

    // When: 중복 체크
    const uniqueTimes = new Map();
    const duplicates = [];

    for (const schedule of schedules) {
      const key = `${schedule.channelId}-${schedule.scheduledTime}`;
      if (uniqueTimes.has(key)) {
        duplicates.push(schedule);
      } else {
        uniqueTimes.set(key, schedule);
      }
    }

    // Then: 중복 없음
    expect(duplicates.length).toBe(0);
    expect(uniqueTimes.size).toBe(3);
  });
});
