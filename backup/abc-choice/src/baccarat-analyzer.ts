/**
 * 바카라 패턴 분석기
 * Player(P) / Banker(B) 패턴 분석
 */

export type BaccaratResult = 'P' | 'B' | 'T'; // Player, Banker, Tie
export type BetChoice = 'P' | 'B';

export interface BaccaratAnalysis {
  recommendation: BetChoice;
  confidence: number;
  reason: string;
  strategies: StrategyResult[];
  stats: BaccaratStats;
}

export interface StrategyResult {
  name: string;
  recommendation: BetChoice;
  confidence: number;
  description: string;
}

export interface BaccaratStats {
  totalRounds: number;
  playerWins: number;
  bankerWins: number;
  ties: number;
  playerPercent: number;
  bankerPercent: number;
  currentStreak: { result: BaccaratResult; count: number };
  lastResults: BaccaratResult[];
}

export class BaccaratAnalyzer {
  private history: BaccaratResult[] = [];

  constructor(initialHistory: BaccaratResult[] = []) {
    this.history = [...initialHistory];
  }

  addResult(result: BaccaratResult): void {
    this.history.push(result);
  }

  setHistory(history: BaccaratResult[]): void {
    this.history = [...history];
  }

  getHistory(): BaccaratResult[] {
    return [...this.history];
  }

  reset(): void {
    this.history = [];
  }

  // 기본 통계
  private getStats(): BaccaratStats {
    const total = this.history.length;
    const playerWins = this.history.filter(r => r === 'P').length;
    const bankerWins = this.history.filter(r => r === 'B').length;
    const ties = this.history.filter(r => r === 'T').length;

    // 현재 연속
    let currentStreak = { result: 'P' as BaccaratResult, count: 0 };
    if (total > 0) {
      const lastResult = this.history[total - 1];
      let count = 0;
      for (let i = total - 1; i >= 0; i--) {
        if (this.history[i] === lastResult) count++;
        else break;
      }
      currentStreak = { result: lastResult, count };
    }

    const nonTieTotal = playerWins + bankerWins;

    return {
      totalRounds: total,
      playerWins,
      bankerWins,
      ties,
      playerPercent: nonTieTotal > 0 ? (playerWins / nonTieTotal) * 100 : 50,
      bankerPercent: nonTieTotal > 0 ? (bankerWins / nonTieTotal) * 100 : 50,
      currentStreak,
      lastResults: this.history.slice(-20)
    };
  }

  // 전략 1: 패턴 매칭 (최근 패턴이 과거에 나왔을 때 다음 결과)
  private strategyPatternMatch(): StrategyResult {
    const historyStr = this.history.filter(r => r !== 'T').join(''); // Tie 제외
    const patternLengths = [3, 4, 5, 6];

    let bestMatch = { pattern: '', nextP: 0, nextB: 0, total: 0 };

    for (const len of patternLengths) {
      if (historyStr.length < len + 1) continue;

      const currentPattern = historyStr.slice(-len);
      let pCount = 0, bCount = 0;

      for (let i = 0; i <= historyStr.length - len - 1; i++) {
        if (historyStr.slice(i, i + len) === currentPattern) {
          const next = historyStr[i + len];
          if (next === 'P') pCount++;
          else if (next === 'B') bCount++;
        }
      }

      const total = pCount + bCount;
      if (total > bestMatch.total) {
        bestMatch = { pattern: currentPattern, nextP: pCount, nextB: bCount, total };
      }
    }

    if (bestMatch.total >= 2) {
      const recommendation: BetChoice = bestMatch.nextP > bestMatch.nextB ? 'P' : 'B';
      const max = Math.max(bestMatch.nextP, bestMatch.nextB);
      const confidence = (max / bestMatch.total) * 100;
      return {
        name: '패턴 매칭',
        recommendation,
        confidence,
        description: `패턴 "${bestMatch.pattern}" → ${recommendation} (${bestMatch.total}회 중 ${max}회)`
      };
    }

    return {
      name: '패턴 매칭',
      recommendation: 'B',
      confidence: 50,
      description: '매칭 패턴 없음'
    };
  }

  // 전략 2: 연속 반전 (긴 연속 후 반전)
  private strategyStreakReversal(): StrategyResult {
    const stats = this.getStats();
    const streak = stats.currentStreak;

    if (streak.result === 'T') {
      return {
        name: '연속 반전',
        recommendation: 'B',
        confidence: 50,
        description: 'Tie 후 - 기본값'
      };
    }

    // 4연속 이상이면 반전 예측
    if (streak.count >= 4) {
      const recommendation: BetChoice = streak.result === 'P' ? 'B' : 'P';
      const confidence = Math.min(50 + (streak.count - 4) * 8, 75);
      return {
        name: '연속 반전',
        recommendation,
        confidence,
        description: `${streak.count}연속 ${streak.result} → 반전 예측`
      };
    }

    // 연속이 짧으면 추세 유지
    if (streak.count >= 2) {
      const recommendation: BetChoice = streak.result === 'P' ? 'P' : 'B';
      return {
        name: '연속 반전',
        recommendation,
        confidence: 55,
        description: `${streak.count}연속 ${streak.result} → 추세 유지`
      };
    }

    return {
      name: '연속 반전',
      recommendation: 'B',
      confidence: 50,
      description: '연속 없음'
    };
  }

  // 전략 3: 지그재그 패턴 (P-B-P-B 교대)
  private strategyZigzag(): StrategyResult {
    const recent = this.history.filter(r => r !== 'T').slice(-6);
    if (recent.length < 4) {
      return {
        name: '지그재그',
        recommendation: 'B',
        confidence: 50,
        description: '데이터 부족'
      };
    }

    // 최근 교대 패턴 확인
    let zigzagCount = 0;
    for (let i = 1; i < recent.length; i++) {
      if (recent[i] !== recent[i - 1]) zigzagCount++;
    }

    const zigzagRatio = zigzagCount / (recent.length - 1);

    if (zigzagRatio >= 0.7) {
      // 지그재그 패턴 - 반대 선택
      const last = recent[recent.length - 1];
      const recommendation: BetChoice = last === 'P' ? 'B' : 'P';
      return {
        name: '지그재그',
        recommendation,
        confidence: 60 + zigzagRatio * 15,
        description: `교대 패턴 감지 (${(zigzagRatio * 100).toFixed(0)}%)`
      };
    }

    return {
      name: '지그재그',
      recommendation: 'B',
      confidence: 50,
      description: '교대 패턴 없음'
    };
  }

  // 전략 4: 하우스 엣지 (Banker가 통계적으로 유리)
  private strategyHouseEdge(): StrategyResult {
    // 바카라에서 Banker 승률이 약간 높음 (50.68% vs 49.32%)
    return {
      name: '하우스 엣지',
      recommendation: 'B',
      confidence: 50.68,
      description: 'Banker 통계적 우위 (50.68%)'
    };
  }

  // 전략 5: 최근 트렌드 (최근 10판 분석)
  private strategyRecentTrend(): StrategyResult {
    const recent = this.history.filter(r => r !== 'T').slice(-10);
    if (recent.length < 5) {
      return {
        name: '최근 트렌드',
        recommendation: 'B',
        confidence: 50,
        description: '데이터 부족'
      };
    }

    const pCount = recent.filter(r => r === 'P').length;
    const bCount = recent.length - pCount;
    const pPercent = (pCount / recent.length) * 100;

    if (pPercent >= 65) {
      return {
        name: '최근 트렌드',
        recommendation: 'P',
        confidence: pPercent,
        description: `최근 ${recent.length}판 중 Player ${pCount}회 (${pPercent.toFixed(0)}%)`
      };
    } else if (pPercent <= 35) {
      return {
        name: '최근 트렌드',
        recommendation: 'B',
        confidence: 100 - pPercent,
        description: `최근 ${recent.length}판 중 Banker ${bCount}회 (${(100 - pPercent).toFixed(0)}%)`
      };
    }

    return {
      name: '최근 트렌드',
      recommendation: 'B',
      confidence: 51,
      description: '균형 상태 - 기본값 Banker'
    };
  }

  // 종합 분석
  analyze(): BaccaratAnalysis {
    const stats = this.getStats();

    if (this.history.length < 3) {
      return {
        recommendation: 'B',
        confidence: 50.68,
        reason: '데이터 부족 - Banker 기본 선택 (하우스 엣지)',
        strategies: [],
        stats
      };
    }

    // 모든 전략 실행
    const strategies: StrategyResult[] = [
      this.strategyPatternMatch(),
      this.strategyStreakReversal(),
      this.strategyZigzag(),
      this.strategyRecentTrend(),
      this.strategyHouseEdge()
    ];

    // 가중 투표
    let pScore = 0, bScore = 0;
    const weights = [2.0, 1.5, 1.2, 1.3, 0.5]; // 전략별 가중치

    strategies.forEach((s, i) => {
      const weight = weights[i] * (s.confidence / 100);
      if (s.recommendation === 'P') pScore += weight;
      else bScore += weight;
    });

    const totalScore = pScore + bScore;
    const recommendation: BetChoice = pScore > bScore ? 'P' : 'B';
    const confidence = (Math.max(pScore, bScore) / totalScore) * 100;

    // 가장 신뢰도 높은 전략 찾기
    const bestStrategy = strategies.reduce((a, b) =>
      a.confidence > b.confidence ? a : b
    );

    return {
      recommendation,
      confidence,
      reason: bestStrategy.description,
      strategies: strategies.sort((a, b) => b.confidence - a.confidence),
      stats
    };
  }
}

export default BaccaratAnalyzer;
