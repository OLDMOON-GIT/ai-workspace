'use client';

import { useState, useEffect, useCallback } from 'react';

interface TestUsecase {
  usecaseId: number;
  name: string;
  description: string | null;
  category: string | null;
  priority: 'P1' | 'P2' | 'P3';
  precondition: string | null;
  steps: any[];
  expectedResult: string | null;
  targetUrl: string | null;
  selectors: Record<string, string>;
  isActive: number;
  createdAt: string;
  updatedAt: string;
}

interface TestScenario {
  scenarioId: number;
  usecaseId: number;
  name: string;
  testCode: string | null;
  testData: Record<string, any>;
  status: string;
  lastRunAt: string | null;
  lastDurationMs: number | null;
  lastError: string | null;
  runCount: number;
  passCount: number;
  failCount: number;
  usecaseName?: string;
  usecaseCategory?: string;
}

interface TestRun {
  runId: number;
  scenarioId: number | null;
  runType: string;
  status: string;
  totalCount: number;
  passedCount: number;
  failedCount: number;
  skippedCount: number;
  durationMs: number | null;
  startedAt: string | null;
  completedAt: string | null;
  errorSummary: string | null;
  scenarioName?: string;
}

type TabType = 'usecases' | 'scenarios' | 'runs';

export default function TestsAdminPage() {
  const [activeTab, setActiveTab] = useState<TabType>('usecases');
  const [loading, setLoading] = useState(false);

  // 유스케이스 상태
  const [usecases, setUsecases] = useState<TestUsecase[]>([]);
  const [showUsecaseModal, setShowUsecaseModal] = useState(false);
  const [editingUsecase, setEditingUsecase] = useState<TestUsecase | null>(null);

  // 시나리오 상태
  const [scenarios, setScenarios] = useState<TestScenario[]>([]);
  const [showScenarioModal, setShowScenarioModal] = useState(false);
  const [editingScenario, setEditingScenario] = useState<TestScenario | null>(null);

  // 실행 기록 상태
  const [runs, setRuns] = useState<TestRun[]>([]);

  // 폼 상태
  const [formData, setFormData] = useState({
    name: '',
    description: '',
    category: '',
    priority: 'P2' as 'P1' | 'P2' | 'P3',
    precondition: '',
    steps: '[]',
    expectedResult: '',
    targetUrl: '',
    selectors: '{}',
    isActive: true,
    // 시나리오용
    usecaseId: 0,
    testCode: '',
    testData: '{}'
  });

  // 데이터 로드
  const loadUsecases = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/test-automation/usecases', { credentials: 'include' });
      const data = await res.json();
      if (data.usecases) setUsecases(data.usecases);
    } catch (err) {
      console.error('유스케이스 로드 실패:', err);
    }
    setLoading(false);
  }, []);

  const loadScenarios = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/test-automation/scenarios', { credentials: 'include' });
      const data = await res.json();
      if (data.scenarios) setScenarios(data.scenarios);
    } catch (err) {
      console.error('시나리오 로드 실패:', err);
    }
    setLoading(false);
  }, []);

  const loadRuns = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/test-automation/runs?limit=50', { credentials: 'include' });
      const data = await res.json();
      if (data.runs) setRuns(data.runs);
    } catch (err) {
      console.error('실행 기록 로드 실패:', err);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    if (activeTab === 'usecases') loadUsecases();
    else if (activeTab === 'scenarios') loadScenarios();
    else if (activeTab === 'runs') loadRuns();
  }, [activeTab, loadUsecases, loadScenarios, loadRuns]);

  // 유스케이스 저장
  const saveUsecase = async () => {
    try {
      const payload = {
        ...(editingUsecase ? { usecaseId: editingUsecase.usecaseId } : {}),
        name: formData.name,
        description: formData.description || null,
        category: formData.category || null,
        priority: formData.priority,
        precondition: formData.precondition || null,
        steps: JSON.parse(formData.steps || '[]'),
        expectedResult: formData.expectedResult || null,
        targetUrl: formData.targetUrl || null,
        selectors: JSON.parse(formData.selectors || '{}'),
        isActive: formData.isActive
      };

      const res = await fetch('/api/test-automation/usecases', {
        method: editingUsecase ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(payload)
      });

      const data = await res.json();
      if (data.success) {
        alert(editingUsecase ? '유스케이스가 수정되었습니다' : '유스케이스가 생성되었습니다');
        setShowUsecaseModal(false);
        setEditingUsecase(null);
        resetForm();
        loadUsecases();
      } else {
        alert('오류: ' + data.error);
      }
    } catch (err) {
      alert('저장 실패: ' + (err as Error).message);
    }
  };

  // 시나리오 저장
  const saveScenario = async () => {
    try {
      const payload = {
        ...(editingScenario ? { scenarioId: editingScenario.scenarioId } : {}),
        usecaseId: formData.usecaseId,
        name: formData.name,
        testCode: formData.testCode || null,
        testData: JSON.parse(formData.testData || '{}'),
        status: 'draft'
      };

      const res = await fetch('/api/test-automation/scenarios', {
        method: editingScenario ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(payload)
      });

      const data = await res.json();
      if (data.success) {
        alert(editingScenario ? '시나리오가 수정되었습니다' : '시나리오가 생성되었습니다');
        setShowScenarioModal(false);
        setEditingScenario(null);
        resetForm();
        loadScenarios();
      } else {
        alert('오류: ' + data.error);
      }
    } catch (err) {
      alert('저장 실패: ' + (err as Error).message);
    }
  };

  // 삭제
  const deleteUsecase = async (usecaseId: number) => {
    if (!confirm('이 유스케이스를 삭제하시겠습니까? 연결된 시나리오도 함께 삭제됩니다.')) return;

    try {
      const res = await fetch(`/api/test-automation/usecases?usecaseId=${usecaseId}`, {
        method: 'DELETE',
        credentials: 'include'
      });
      const data = await res.json();
      if (data.success) {
        loadUsecases();
      } else {
        alert('삭제 실패: ' + data.error);
      }
    } catch (err) {
      alert('삭제 실패: ' + (err as Error).message);
    }
  };

  const deleteScenario = async (scenarioId: number) => {
    if (!confirm('이 시나리오를 삭제하시겠습니까?')) return;

    try {
      const res = await fetch(`/api/test-automation/scenarios?scenarioId=${scenarioId}`, {
        method: 'DELETE',
        credentials: 'include'
      });
      const data = await res.json();
      if (data.success) {
        loadScenarios();
      } else {
        alert('삭제 실패: ' + data.error);
      }
    } catch (err) {
      alert('삭제 실패: ' + (err as Error).message);
    }
  };

  // 테스트 실행
  const runTest = async (type: 'single' | 'category' | 'all', id?: number, category?: string) => {
    try {
      const payload: any = { runType: type };
      if (type === 'single' && id) payload.scenarioId = id;
      if (type === 'category' && category) payload.category = category;

      const res = await fetch('/api/test-automation/runs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(payload)
      });

      const data = await res.json();
      if (data.success) {
        alert(`테스트 실행이 예약되었습니다 (Run ID: ${data.runId})\n총 ${data.totalScenarios}개 시나리오`);
        loadRuns();
      } else {
        alert('실행 실패: ' + data.error);
      }
    } catch (err) {
      alert('실행 실패: ' + (err as Error).message);
    }
  };

  // 폼 초기화
  const resetForm = () => {
    setFormData({
      name: '',
      description: '',
      category: '',
      priority: 'P2',
      precondition: '',
      steps: '[]',
      expectedResult: '',
      targetUrl: '',
      selectors: '{}',
      isActive: true,
      usecaseId: 0,
      testCode: '',
      testData: '{}'
    });
  };

  // 편집 모드 설정
  const editUsecase = (uc: TestUsecase) => {
    setEditingUsecase(uc);
    setFormData({
      ...formData,
      name: uc.name,
      description: uc.description || '',
      category: uc.category || '',
      priority: uc.priority,
      precondition: uc.precondition || '',
      steps: JSON.stringify(uc.steps, null, 2),
      expectedResult: uc.expectedResult || '',
      targetUrl: uc.targetUrl || '',
      selectors: JSON.stringify(uc.selectors, null, 2),
      isActive: uc.isActive === 1
    });
    setShowUsecaseModal(true);
  };

  const editScenario = (sc: TestScenario) => {
    setEditingScenario(sc);
    setFormData({
      ...formData,
      name: sc.name,
      usecaseId: sc.usecaseId,
      testCode: sc.testCode || '',
      testData: JSON.stringify(sc.testData, null, 2)
    });
    setShowScenarioModal(true);
  };

  // 상태 뱃지 색상
  const getStatusBadge = (status: string) => {
    const colors: Record<string, string> = {
      'draft': 'bg-gray-500',
      'ready': 'bg-blue-500',
      'running': 'bg-yellow-500',
      'passed': 'bg-green-500',
      'completed': 'bg-green-500',
      'failed': 'bg-red-500',
      'skipped': 'bg-gray-400',
      'pending': 'bg-yellow-400',
      'cancelled': 'bg-gray-600'
    };
    return colors[status] || 'bg-gray-500';
  };

  const priorityColors: Record<string, string> = {
    'P1': 'bg-red-500',
    'P2': 'bg-yellow-500',
    'P3': 'bg-green-500'
  };

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <h1 className="text-2xl font-bold mb-6">Playwright 테스트 자동화</h1>

      {/* 탭 */}
      <div className="flex border-b mb-6">
        {(['usecases', 'scenarios', 'runs'] as TabType[]).map(tab => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`px-4 py-2 font-medium ${activeTab === tab
              ? 'border-b-2 border-blue-500 text-blue-600'
              : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            {tab === 'usecases' ? '유스케이스' : tab === 'scenarios' ? '시나리오' : '실행 기록'}
          </button>
        ))}
      </div>

      {loading && <div className="text-center py-4">로딩 중...</div>}

      {/* 유스케이스 탭 */}
      {activeTab === 'usecases' && (
        <div>
          <div className="flex justify-between items-center mb-4">
            <span className="text-gray-600">총 {usecases.length}개</span>
            <button
              onClick={() => { resetForm(); setEditingUsecase(null); setShowUsecaseModal(true); }}
              className="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600"
            >
              + 유스케이스 추가
            </button>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full border-collapse border">
              <thead className="bg-gray-100">
                <tr>
                  <th className="border p-2 text-left">ID</th>
                  <th className="border p-2 text-left">이름</th>
                  <th className="border p-2 text-left">카테고리</th>
                  <th className="border p-2 text-center">우선순위</th>
                  <th className="border p-2 text-center">활성</th>
                  <th className="border p-2 text-center">액션</th>
                </tr>
              </thead>
              <tbody>
                {usecases.map(uc => (
                  <tr key={uc.usecaseId} className="hover:bg-gray-50">
                    <td className="border p-2">{uc.usecaseId}</td>
                    <td className="border p-2">{uc.name}</td>
                    <td className="border p-2">{uc.category || '-'}</td>
                    <td className="border p-2 text-center">
                      <span className={`px-2 py-1 rounded text-white text-xs ${priorityColors[uc.priority]}`}>
                        {uc.priority}
                      </span>
                    </td>
                    <td className="border p-2 text-center">
                      {uc.isActive ? '✅' : '❌'}
                    </td>
                    <td className="border p-2 text-center">
                      <button
                        onClick={() => editUsecase(uc)}
                        className="text-blue-500 hover:underline mr-2"
                      >
                        편집
                      </button>
                      <button
                        onClick={() => deleteUsecase(uc.usecaseId)}
                        className="text-red-500 hover:underline"
                      >
                        삭제
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* 시나리오 탭 */}
      {activeTab === 'scenarios' && (
        <div>
          <div className="flex justify-between items-center mb-4">
            <span className="text-gray-600">총 {scenarios.length}개</span>
            <div className="flex gap-2">
              <button
                onClick={() => runTest('all')}
                className="px-4 py-2 bg-green-500 text-white rounded hover:bg-green-600"
              >
                전체 실행
              </button>
              <button
                onClick={() => { resetForm(); setEditingScenario(null); setShowScenarioModal(true); }}
                className="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600"
              >
                + 시나리오 추가
              </button>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full border-collapse border">
              <thead className="bg-gray-100">
                <tr>
                  <th className="border p-2 text-left">ID</th>
                  <th className="border p-2 text-left">이름</th>
                  <th className="border p-2 text-left">유스케이스</th>
                  <th className="border p-2 text-center">상태</th>
                  <th className="border p-2 text-center">실행/성공/실패</th>
                  <th className="border p-2 text-center">마지막 실행</th>
                  <th className="border p-2 text-center">액션</th>
                </tr>
              </thead>
              <tbody>
                {scenarios.map(sc => (
                  <tr key={sc.scenarioId} className="hover:bg-gray-50">
                    <td className="border p-2">{sc.scenarioId}</td>
                    <td className="border p-2">{sc.name}</td>
                    <td className="border p-2 text-sm text-gray-600">
                      {sc.usecaseName || `UC-${sc.usecaseId}`}
                    </td>
                    <td className="border p-2 text-center">
                      <span className={`px-2 py-1 rounded text-white text-xs ${getStatusBadge(sc.status)}`}>
                        {sc.status}
                      </span>
                    </td>
                    <td className="border p-2 text-center text-sm">
                      {sc.runCount} / <span className="text-green-600">{sc.passCount}</span> / <span className="text-red-600">{sc.failCount}</span>
                    </td>
                    <td className="border p-2 text-center text-sm text-gray-500">
                      {sc.lastRunAt ? new Date(sc.lastRunAt).toLocaleString('ko-KR') : '-'}
                    </td>
                    <td className="border p-2 text-center">
                      <button
                        onClick={() => runTest('single', sc.scenarioId)}
                        className="text-green-500 hover:underline mr-2"
                      >
                        실행
                      </button>
                      <button
                        onClick={() => editScenario(sc)}
                        className="text-blue-500 hover:underline mr-2"
                      >
                        편집
                      </button>
                      <button
                        onClick={() => deleteScenario(sc.scenarioId)}
                        className="text-red-500 hover:underline"
                      >
                        삭제
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* 실행 기록 탭 */}
      {activeTab === 'runs' && (
        <div>
          <div className="flex justify-between items-center mb-4">
            <span className="text-gray-600">최근 {runs.length}개</span>
            <button
              onClick={loadRuns}
              className="px-4 py-2 bg-gray-500 text-white rounded hover:bg-gray-600"
            >
              새로고침
            </button>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full border-collapse border">
              <thead className="bg-gray-100">
                <tr>
                  <th className="border p-2 text-left">Run ID</th>
                  <th className="border p-2 text-left">유형</th>
                  <th className="border p-2 text-center">상태</th>
                  <th className="border p-2 text-center">결과</th>
                  <th className="border p-2 text-center">소요시간</th>
                  <th className="border p-2 text-center">시작</th>
                  <th className="border p-2 text-center">완료</th>
                </tr>
              </thead>
              <tbody>
                {runs.map(run => (
                  <tr key={run.runId} className="hover:bg-gray-50">
                    <td className="border p-2">{run.runId}</td>
                    <td className="border p-2">
                      {run.runType}
                      {run.scenarioName && <span className="text-gray-500 text-sm ml-1">({run.scenarioName})</span>}
                    </td>
                    <td className="border p-2 text-center">
                      <span className={`px-2 py-1 rounded text-white text-xs ${getStatusBadge(run.status)}`}>
                        {run.status}
                      </span>
                    </td>
                    <td className="border p-2 text-center text-sm">
                      <span className="text-green-600">{run.passedCount}</span>
                      {' / '}
                      <span className="text-red-600">{run.failedCount}</span>
                      {' / '}
                      <span className="text-gray-500">{run.skippedCount}</span>
                      {' / '}
                      {run.totalCount}
                    </td>
                    <td className="border p-2 text-center text-sm">
                      {run.durationMs ? `${(run.durationMs / 1000).toFixed(1)}s` : '-'}
                    </td>
                    <td className="border p-2 text-center text-sm text-gray-500">
                      {run.startedAt ? new Date(run.startedAt).toLocaleString('ko-KR') : '-'}
                    </td>
                    <td className="border p-2 text-center text-sm text-gray-500">
                      {run.completedAt ? new Date(run.completedAt).toLocaleString('ko-KR') : '-'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* 유스케이스 모달 */}
      {showUsecaseModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 max-w-2xl w-full max-h-[90vh] overflow-y-auto">
            <h2 className="text-xl font-bold mb-4">
              {editingUsecase ? '유스케이스 편집' : '유스케이스 추가'}
            </h2>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium mb-1">이름 *</label>
                <input
                  type="text"
                  value={formData.name}
                  onChange={e => setFormData({ ...formData, name: e.target.value })}
                  className="w-full border rounded p-2"
                  placeholder="예: 로그인 테스트"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium mb-1">카테고리</label>
                  <input
                    type="text"
                    value={formData.category}
                    onChange={e => setFormData({ ...formData, category: e.target.value })}
                    className="w-full border rounded p-2"
                    placeholder="예: auth, content, payment"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">우선순위</label>
                  <select
                    value={formData.priority}
                    onChange={e => setFormData({ ...formData, priority: e.target.value as 'P1' | 'P2' | 'P3' })}
                    className="w-full border rounded p-2"
                  >
                    <option value="P1">P1 (높음)</option>
                    <option value="P2">P2 (중간)</option>
                    <option value="P3">P3 (낮음)</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium mb-1">설명</label>
                <textarea
                  value={formData.description}
                  onChange={e => setFormData({ ...formData, description: e.target.value })}
                  className="w-full border rounded p-2"
                  rows={2}
                />
              </div>

              <div>
                <label className="block text-sm font-medium mb-1">대상 URL</label>
                <input
                  type="text"
                  value={formData.targetUrl}
                  onChange={e => setFormData({ ...formData, targetUrl: e.target.value })}
                  className="w-full border rounded p-2"
                  placeholder="예: /login"
                />
              </div>

              <div>
                <label className="block text-sm font-medium mb-1">사전 조건</label>
                <textarea
                  value={formData.precondition}
                  onChange={e => setFormData({ ...formData, precondition: e.target.value })}
                  className="w-full border rounded p-2"
                  rows={2}
                />
              </div>

              <div>
                <label className="block text-sm font-medium mb-1">테스트 단계 (JSON)</label>
                <textarea
                  value={formData.steps}
                  onChange={e => setFormData({ ...formData, steps: e.target.value })}
                  className="w-full border rounded p-2 font-mono text-sm"
                  rows={4}
                  placeholder='[{"step": 1, "action": "click", "target": "#login-btn"}]'
                />
              </div>

              <div>
                <label className="block text-sm font-medium mb-1">기대 결과</label>
                <textarea
                  value={formData.expectedResult}
                  onChange={e => setFormData({ ...formData, expectedResult: e.target.value })}
                  className="w-full border rounded p-2"
                  rows={2}
                />
              </div>

              <div>
                <label className="block text-sm font-medium mb-1">셀렉터 (JSON)</label>
                <textarea
                  value={formData.selectors}
                  onChange={e => setFormData({ ...formData, selectors: e.target.value })}
                  className="w-full border rounded p-2 font-mono text-sm"
                  rows={3}
                  placeholder='{"loginButton": "#login-btn", "emailInput": "input[name=email]"}'
                />
              </div>

              <div className="flex items-center">
                <input
                  type="checkbox"
                  id="isActive"
                  checked={formData.isActive}
                  onChange={e => setFormData({ ...formData, isActive: e.target.checked })}
                  className="mr-2"
                />
                <label htmlFor="isActive" className="text-sm">활성화</label>
              </div>
            </div>

            <div className="flex justify-end gap-2 mt-6">
              <button
                onClick={() => { setShowUsecaseModal(false); setEditingUsecase(null); }}
                className="px-4 py-2 border rounded hover:bg-gray-100"
              >
                취소
              </button>
              <button
                onClick={saveUsecase}
                className="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600"
              >
                저장
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 시나리오 모달 */}
      {showScenarioModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 max-w-3xl w-full max-h-[90vh] overflow-y-auto">
            <h2 className="text-xl font-bold mb-4">
              {editingScenario ? '시나리오 편집' : '시나리오 추가'}
            </h2>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium mb-1">이름 *</label>
                <input
                  type="text"
                  value={formData.name}
                  onChange={e => setFormData({ ...formData, name: e.target.value })}
                  className="w-full border rounded p-2"
                  placeholder="예: 정상 로그인 테스트"
                />
              </div>

              <div>
                <label className="block text-sm font-medium mb-1">유스케이스 *</label>
                <select
                  value={formData.usecaseId}
                  onChange={e => setFormData({ ...formData, usecaseId: parseInt(e.target.value) })}
                  className="w-full border rounded p-2"
                >
                  <option value={0}>선택하세요</option>
                  {usecases.map(uc => (
                    <option key={uc.usecaseId} value={uc.usecaseId}>
                      [{uc.category || '미분류'}] {uc.name}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium mb-1">테스트 코드 (JavaScript)</label>
                <textarea
                  value={formData.testCode}
                  onChange={e => setFormData({ ...formData, testCode: e.target.value })}
                  className="w-full border rounded p-2 font-mono text-sm"
                  rows={15}
                  placeholder={`// page, testData, BASE_URL 사용 가능
await page.goto(BASE_URL + '/login');
await page.fill('input[name="email"]', testData.email);
await page.fill('input[name="password"]', testData.password);
await page.click('button[type="submit"]');
await page.waitForURL(BASE_URL + '/dashboard');`}
                />
              </div>

              <div>
                <label className="block text-sm font-medium mb-1">테스트 데이터 (JSON)</label>
                <textarea
                  value={formData.testData}
                  onChange={e => setFormData({ ...formData, testData: e.target.value })}
                  className="w-full border rounded p-2 font-mono text-sm"
                  rows={4}
                  placeholder='{"email": "test@example.com", "password": "test1234"}'
                />
              </div>
            </div>

            <div className="flex justify-end gap-2 mt-6">
              <button
                onClick={() => { setShowScenarioModal(false); setEditingScenario(null); }}
                className="px-4 py-2 border rounded hover:bg-gray-100"
              >
                취소
              </button>
              <button
                onClick={saveScenario}
                className="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600"
              >
                저장
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
