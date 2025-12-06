/**
 * 패턴 분석기
 * 파랑(B)/빨강(R) 시퀀스를 분석하여 다음 선택 예측
 */

export type Choice = 'B' | 'R'; // Blue, Red
export type ChoiceHistory = Choice[];

export interface PatternMatch {
  pattern: string;
  nextChoice: Choice;
  confidence: number;
  occurrences: number;
}

export interface AnalysisResult {
  recommendedChoice: Choice;
  confidence: number;
  reason: string;
  patterns: PatternMatch[];
  stats: {
    totalRounds: number;
    blueCount: number;
    redCount: number;
    bluePercent: number;
    redPercent: number;
    currentStreak: { choice: Choice; count: number };
    longestStreak: { choice: Choice; count: number };
  };
}

export class PatternAnalyzer {
  private history: ChoiceHistory = [];
  private patternLengths = [2, 3, 4, 5, 6]; // 분석할 패턴 길이들

  constructor(initialHistory: ChoiceHistory = []) {
    this.history = [...initialHistory];
  }

  // 기록 추가
  addResult(choice: Choice): void {
    this.history.push(choice);
  }

  // 기록 초기화
  reset(): void {
    this.history = [];
  }

  // 기록 설정
  setHistory(history: ChoiceHistory): void {
    this.history = [...history];
  }

  // 현재 기록 반환
  getHistory(): ChoiceHistory {
    return [...this.history];
  }

  // 기본 통계 계산
  private calculateStats() {
    const totalRounds = this.history.length;
    const blueCount = this.history.filter(c => c === 'B').length;
    const redCount = totalRounds - blueCount;

    // 현재 연속
    let currentStreak = { choice: 'B' as Choice, count: 0 };
    if (totalRounds > 0) {
      const lastChoice = this.history[totalRounds - 1];
      let count = 0;
      for (let i = totalRounds - 1; i >= 0; i--) {
        if (this.history[i] === lastChoice) {
          count++;
        } else {
          break;
        }
      }
      currentStreak = { choice: lastChoice, count };
    }

    // 최장 연속
    let longestStreak = { choice: 'B' as Choice, count: 0 };
    let tempStreak = { choice: 'B' as Choice, count: 0 };
    for (const choice of this.history) {
      if (choice === tempStreak.choice) {
        tempStreak.count++;
      } else {
        if (tempStreak.count > longestStreak.count) {
          longestStreak = { ...tempStreak };
        }
        tempStreak = { choice, count: 1 };
      }
    }
    if (tempStreak.count > longestStreak.count) {
      longestStreak = { ...tempStreak };
    }

    return {
      totalRounds,
      blueCount,
      redCount,
      bluePercent: totalRounds > 0 ? (blueCount / totalRounds) * 100 : 50,
      redPercent: totalRounds > 0 ? (redCount / totalRounds) * 100 : 50,
      currentStreak,
      longestStreak
    };
  }

  // 패턴 매칭 분석
  private findPatternMatches(): PatternMatch[] {
    const matches: PatternMatch[] = [];
    const historyStr = this.history.join('');

    for (const len of this.patternLengths) {
      if (this.history.length < len + 1) continue;

      // 현재 끝 패턴
      const currentPattern = historyStr.slice(-len);

      // 이 패턴이 과거에 몇 번 나왔고, 그 다음에 뭐가 왔는지 분석
      let blueAfter = 0;
      let redAfter = 0;

      for (let i = 0; i <= historyStr.length - len - 1; i++) {
        const pattern = historyStr.slice(i, i + len);
        if (pattern === currentPattern) {
          const next = historyStr[i + len];
          if (next === 'B') blueAfter++;
          else if (next === 'R') redAfter++;
        }
      }

      const total = blueAfter + redAfter;
      if (total >= 2) { // 최소 2번 이상 출현한 패턴만
        const nextChoice: Choice = blueAfter > redAfter ? 'B' : 'R';
        const maxCount = Math.max(blueAfter, redAfter);
        const confidence = (maxCount / total) * 100;

        matches.push({
          pattern: currentPattern,
          nextChoice,
          confidence,
          occurrences: total
        });
      }
    }

    // 신뢰도 순으로 정렬
    return matches.sort((a, b) => {
      // 출현 횟수 * 신뢰도로 정렬
      const scoreA = a.occurrences * a.confidence;
      const scoreB = b.occurrences * b.confidence;
      return scoreB - scoreA;
    });
  }

  // 연속 패턴 분석 (너무 길게 연속되면 반대쪽 예측)
  private analyzeStreakPattern(): { choice: Choice; confidence: number } | null {
    const stats = this.calculateStats();
    const streak = stats.currentStreak;

    // 5연속 이상이면 반대쪽 예측 (확률적으로 변화 가능성 높음)
    if (streak.count >= 5) {
      const oppositeChoice: Choice = streak.choice === 'B' ? 'R' : 'B';
      // 연속 길이에 따라 신뢰도 증가 (최대 70%)
      const confidence = Math.min(50 + (streak.count - 5) * 5, 70);
      return { choice: oppositeChoice, confidence };
    }

    return null;
  }

  // 최근 트렌드 분석 (최근 10개)
  private analyzeRecentTrend(): { choice: Choice; confidence: number } | null {
    const recent = this.history.slice(-10);
    if (recent.length < 5) return null;

    const blueCount = recent.filter(c => c === 'B').length;
    const redCount = recent.length - blueCount;

    // 70% 이상 한쪽으로 쏠리면 트렌드로 판단
    const bluePercent = (blueCount / recent.length) * 100;
    if (bluePercent >= 70) {
      return { choice: 'B', confidence: bluePercent };
    } else if (bluePercent <= 30) {
      return { choice: 'R', confidence: 100 - bluePercent };
    }

    return null;
  }

  // 종합 분석
  analyze(): AnalysisResult {
    const stats = this.calculateStats();
    const patternMatches = this.findPatternMatches();
    const streakAnalysis = this.analyzeStreakPattern();
    const trendAnalysis = this.analyzeRecentTrend();

    // 기본값
    let recommendedChoice: Choice = 'B';
    let confidence = 50;
    let reason = '데이터 부족 - 랜덤 선택';

    // 우선순위: 패턴 매칭 > 연속 패턴 > 트렌드 > 기본 확률
    if (patternMatches.length > 0 && patternMatches[0].occurrences >= 3) {
      const best = patternMatches[0];
      recommendedChoice = best.nextChoice;
      confidence = best.confidence;
      reason = `패턴 "${best.pattern}" 매칭 (${best.occurrences}회 출현)`;
    } else if (streakAnalysis && streakAnalysis.confidence > 55) {
      recommendedChoice = streakAnalysis.choice;
      confidence = streakAnalysis.confidence;
      reason = `${stats.currentStreak.count}연속 ${stats.currentStreak.choice} 후 반전 예측`;
    } else if (trendAnalysis && trendAnalysis.confidence > 65) {
      recommendedChoice = trendAnalysis.choice;
      confidence = trendAnalysis.confidence;
      reason = `최근 트렌드 ${trendAnalysis.choice} 우세`;
    } else if (stats.totalRounds > 0) {
      // 전체 비율 기반
      recommendedChoice = stats.bluePercent > stats.redPercent ? 'B' : 'R';
      confidence = Math.max(stats.bluePercent, stats.redPercent);
      reason = `전체 비율 기반 (B: ${stats.bluePercent.toFixed(1)}%, R: ${stats.redPercent.toFixed(1)}%)`;
    }

    return {
      recommendedChoice,
      confidence,
      reason,
      patterns: patternMatches.slice(0, 5), // 상위 5개 패턴만
      stats
    };
  }
}

export default PatternAnalyzer;
