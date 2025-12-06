/**
 * JSON 파싱 유틸리티 함수 (CommonJS 버전)
 * unified-worker.js 등 Node.js 스크립트에서 사용
 */

/**
 * narration 필드에서 글자수 카운트 제거 (BTS-0000035)
 * 예: "이것은 시작입니다 (150자)" → "이것은 시작입니다"
 *
 * @param {any} data - 파싱된 JSON 객체
 * @returns {any} narration이 정제된 객체
 */
function cleanNarrationCharCounts(data) {
  if (!data || typeof data !== 'object') return data;

  // scenes 배열 처리
  if (Array.isArray(data.scenes)) {
    data.scenes = data.scenes.map(scene => {
      if (scene && typeof scene === 'object' && scene.narration) {
        // narration에서 (xx자), (xx~yy자) 패턴 제거
        scene.narration = scene.narration.replace(/\s*\([0-9~]+자\)/g, '');
      }
      return scene;
    });
  }

  // 최상위 narration 필드도 처리
  if (data.narration && typeof data.narration === 'string') {
    data.narration = data.narration.replace(/\s*\([0-9~]+자\)/g, '');
  }

  return data;
}

/**
 * JSON 문자열을 안전하게 파싱
 *
 * @param {string} jsonString - 파싱할 JSON 문자열
 * @returns {{success: boolean, data?: any, error?: string, fixed?: boolean}}
 */
function parseJsonSafely(jsonString) {
  // 1단계: 원본 그대로 파싱 시도
  try {
    let data = JSON.parse(jsonString);
    // BTS-0000035: narration에서 글자수 카운트 제거
    data = cleanNarrationCharCounts(data);
    return { success: true, data, fixed: false };
  } catch (firstError) {
    // 2단계: 자동 수정 후 파싱 시도
    try {
      const fixed = fixJsonString(jsonString);
      let data = JSON.parse(fixed);
      // BTS-0000035: narration에서 글자수 카운트 제거
      data = cleanNarrationCharCounts(data);
      return { success: true, data, fixed: true };
    } catch (secondError) {
      // 최종 실패
      return {
        success: false,
        error: `JSON 파싱 실패: ${secondError.message}`
      };
    }
  }
}

/**
 * JSON 문자열 자동 수정
 *
 * @param {string} jsonString - 수정할 JSON 문자열
 * @returns {string} 수정된 JSON 문자열
 */
function fixJsonString(jsonString) {
  let fixed = jsonString;

  // Step 0: 코드 블록 마커 제거
  fixed = fixed.replace(/^```json?\s*/i, '');
  fixed = fixed.replace(/```\s*$/i, '');
  fixed = fixed.replace(/^\s*json\s*$/im, '');

  // Step 0.1: 문자열 값 뒤의 괄호 제거 (글자수 카운트 등)
  // "narration": "텍스트"(20자) -> "narration": "텍스트"
  // "narration": "텍스트" (20자) -> "narration": "텍스트"
  fixed = fixed.replace(/"([^"\\]*(?:\\.[^"\\]*)*)"\s*:\s*"([^"\\]*(?:\\.[^"\\]*)*)"\s*\([^)]+\)/g, '"$1": "$2"');

  // Step 1: JSON 시작점 찾기
  const firstBrace = fixed.indexOf('{');
  if (firstBrace > 0) {
    fixed = fixed.substring(firstBrace);
  } else if (firstBrace === -1) {
    throw new Error('No JSON object found in string');
  }

  // Step 2: JSON 끝점 찾기
  const lastBrace = fixed.lastIndexOf('}');
  if (lastBrace > 0 && lastBrace < fixed.length - 1) {
    fixed = fixed.substring(0, lastBrace + 1);
  }

  // Step 3: 제어 문자 이스케이프
  fixed = escapeControlCharactersInJson(fixed);

  // Step 4: Trailing comma 제거
  fixed = fixed.replace(/,(\s*})/g, '$1');
  fixed = fixed.replace(/,(\s*\])/g, '$1');

  return fixed;
}

/**
 * JSON 문자열 내의 문자열 값에서 제어 문자를 이스케이프
 *
 * @param {string} jsonString - JSON 문자열
 * @returns {string} 제어 문자가 이스케이프된 JSON 문자열
 */
function escapeControlCharactersInJson(jsonString) {
  let result = '';
  let inString = false;
  let isEscaped = false;
  let depth = 0; // 중첩된 따옴표 추적

  for (let i = 0; i < jsonString.length; i++) {
    const char = jsonString[i];

    if (isEscaped) {
      result += char;
      isEscaped = false;
      continue;
    }

    if (char === '\\') {
      result += char;
      isEscaped = true;
      continue;
    }

    if (char === '"') {
      if (!inString) {
        // 문자열 시작
        inString = true;
        depth = 0;
        result += char;
      } else {
        // 문자열 안에서 따옴표 만남
        // 다음 문자가 : 또는 , 또는 } 또는 ]이면 문자열 끝
        // 아니면 이스케이프되어야 할 따옴표
        let isStringEnd = false;
        for (let j = i + 1; j < jsonString.length; j++) {
          const nextChar = jsonString[j];
          if (nextChar === ' ' || nextChar === '\n' || nextChar === '\r' || nextChar === '\t') {
            continue; // 공백 건너뛰기
          }
          if (nextChar === ':' || nextChar === ',' || nextChar === '}' || nextChar === ']') {
            isStringEnd = true;
          }
          break;
        }

        if (isStringEnd) {
          // 문자열 끝
          inString = false;
          result += char;
        } else {
          // 문자열 안의 이스케이프되지 않은 따옴표
          result += '\\"';
        }
      }
      continue;
    }

    if (inString) {
      switch (char) {
        case '\n':
          result += '\\n';
          break;
        case '\r':
          result += '\\r';
          break;
        case '\t':
          result += '\\t';
          break;
        case '\b':
          result += '\\b';
          break;
        case '\f':
          result += '\\f';
          break;
        default:
          const code = char.charCodeAt(0);
          if (code < 32 && code !== 10 && code !== 13 && code !== 9) {
            result += '\\u' + ('0000' + code.toString(16)).slice(-4);
          } else {
            result += char;
          }
      }
    } else {
      result += char;
    }
  }

  return result;
}

module.exports = {
  parseJsonSafely,
  fixJsonString,
  cleanNarrationCharCounts
};
