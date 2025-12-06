/**
 * API 서버
 * 패턴 분석 및 기록 관리 API 제공
 */

import express from 'express';
import cors from 'cors';
import { PatternAnalyzer, Choice } from './pattern-analyzer';
import * as db from './db';

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static('public'));

// 세션 관리
app.get('/api/sessions', (req, res) => {
  try {
    const sessions = db.getSessions();
    res.json({ sessions });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/sessions', (req, res) => {
  try {
    const { name, siteUrl } = req.body;
    if (!name) {
      return res.status(400).json({ error: '세션 이름이 필요합니다' });
    }
    const id = db.createSession(name, siteUrl);
    res.json({ id, message: '세션이 생성되었습니다' });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

app.delete('/api/sessions/:id', (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const deleted = db.deleteSession(id);
    if (deleted) {
      res.json({ message: '세션이 삭제되었습니다' });
    } else {
      res.status(404).json({ error: '세션을 찾을 수 없습니다' });
    }
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// 기록 및 분석
app.get('/api/sessions/:id/records', (req, res) => {
  try {
    const sessionId = parseInt(req.params.id);
    const records = db.getRecords(sessionId);
    const stats = db.getSessionStats(sessionId);
    res.json({ records, stats });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// 결과 추가 및 다음 예측
app.post('/api/sessions/:id/records', (req, res) => {
  try {
    const sessionId = parseInt(req.params.id);
    const { result, predicted } = req.body;

    if (!result || !['B', 'R'].includes(result)) {
      return res.status(400).json({ error: '결과는 B 또는 R이어야 합니다' });
    }

    // 기록 저장
    db.addRecord(sessionId, result as Choice, predicted as Choice | undefined);

    // 새로운 분석
    const history = db.getSessionHistory(sessionId);
    const analyzer = new PatternAnalyzer(history);
    const analysis = analyzer.analyze();

    // 분석 로그 저장
    db.addAnalysisLog(
      sessionId,
      history.length,
      analysis.recommendedChoice,
      analysis.confidence,
      analysis.reason,
      analysis.patterns
    );

    const stats = db.getSessionStats(sessionId);

    res.json({
      recorded: true,
      analysis,
      stats
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// 현재 분석만 (기록 추가 없이)
app.get('/api/sessions/:id/analyze', (req, res) => {
  try {
    const sessionId = parseInt(req.params.id);
    const history = db.getSessionHistory(sessionId);

    if (history.length === 0) {
      return res.json({
        analysis: {
          recommendedChoice: 'B',
          confidence: 50,
          reason: '데이터 없음 - 첫 결과를 입력해주세요',
          patterns: [],
          stats: {
            totalRounds: 0,
            blueCount: 0,
            redCount: 0,
            bluePercent: 50,
            redPercent: 50,
            currentStreak: { choice: 'B', count: 0 },
            longestStreak: { choice: 'B', count: 0 }
          }
        }
      });
    }

    const analyzer = new PatternAnalyzer(history);
    const analysis = analyzer.analyze();

    res.json({ analysis });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// 히스토리 직접 설정 (외부에서 복사해온 기록)
app.post('/api/sessions/:id/history', (req, res) => {
  try {
    const sessionId = parseInt(req.params.id);
    const { history } = req.body;

    if (!Array.isArray(history)) {
      return res.status(400).json({ error: 'history는 배열이어야 합니다' });
    }

    // 유효성 검사
    for (const item of history) {
      if (!['B', 'R'].includes(item)) {
        return res.status(400).json({ error: '모든 항목은 B 또는 R이어야 합니다' });
      }
    }

    // 기존 기록 삭제 후 새로 입력
    const deleteStmt = require('./db').default.prepare('DELETE FROM records WHERE session_id = ?');
    deleteStmt.run(sessionId);

    // 새 기록 입력
    for (const result of history) {
      db.addRecord(sessionId, result as Choice);
    }

    // 분석
    const analyzer = new PatternAnalyzer(history);
    const analysis = analyzer.analyze();
    const stats = db.getSessionStats(sessionId);

    res.json({
      imported: history.length,
      analysis,
      stats
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// 서버 시작
const PORT = process.env.PORT || 3100;
app.listen(PORT, () => {
  console.log(`
╔═══════════════════════════════════════════════════════════╗
║          ABC Choice - Pattern Analyzer Server             ║
╠═══════════════════════════════════════════════════════════╣
║  Server running on: http://localhost:${PORT}                 ║
║  API Docs: http://localhost:${PORT}/api                      ║
╚═══════════════════════════════════════════════════════════╝
  `);
});

export default app;
