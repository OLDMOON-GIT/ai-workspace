/**
 * 상태 배지 컴포넌트
 * BTS-3363: content.status 3단계로 단순화
 */

interface StatusBadgeProps {
  status: 'draft' | 'script' | 'video' | 'completed' | 'failed';
}

export default function StatusBadge({ status }: StatusBadgeProps) {
  const styles: Record<string, string> = {
    draft: 'bg-gray-500/20 text-gray-300',
    script: 'bg-blue-500/20 text-blue-300',
    video: 'bg-purple-500/20 text-purple-300',
    completed: 'bg-green-500/20 text-green-300',
    failed: 'bg-red-500/20 text-red-300'
  };

  const labels: Record<string, string> = {
    draft: '초안',
    script: '대본 완료',
    video: '영상 완료',
    completed: '완료',
    failed: '실패'
  };

  return (
    <span className={`rounded px-2 py-1 text-xs font-semibold ${styles[status] || 'bg-gray-500/20 text-gray-300'}`}>
      {labels[status] || status}
    </span>
  );
}
