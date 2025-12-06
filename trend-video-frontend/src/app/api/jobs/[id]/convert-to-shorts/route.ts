// jobs -> tasks 경로 호환성 래퍼
// /api/jobs/${taskId}/convert-to-shorts -> /api/tasks/[id]/convert-to-shorts
import { POST } from '@/app/api/tasks/[id]/convert-to-shorts/route';

export { POST };
