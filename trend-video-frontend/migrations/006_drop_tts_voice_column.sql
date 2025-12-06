-- tts_voice 컬럼 삭제 (tts_type으로 대체됨)
-- SQLite 3.35.0+ 필요

-- task 테이블
ALTER TABLE task DROP COLUMN tts_voice;

-- content 테이블
ALTER TABLE content DROP COLUMN tts_voice;
