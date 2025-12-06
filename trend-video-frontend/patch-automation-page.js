const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, 'src/app/automation/page.tsx');
let content = fs.readFileSync(filePath, 'utf-8');

// 1. Add import for imageFilterUtils
const importLine = "import { STATUS_LABELS, isFailedStatus, isProcessingStatus, QUEUE_TAB_STATUS_MAP, QUEUE_TAB_LABELS } from '@/types/automation';";
const newImportLine = `import { STATUS_LABELS, isFailedStatus, isProcessingStatus, QUEUE_TAB_STATUS_MAP, QUEUE_TAB_LABELS } from '@/types/automation';
import { isHiddenImage, extractImagePrefix } from '@/lib/utils/imageFilterUtils';`;

if (!content.includes('imageFilterUtils')) {
  content = content.replace(importLine, newImportLine);
  console.log('Added imageFilterUtils import');
}

// 2. Find and replace the allImages rendering section
// Looking for: {allImages.map((file: any) => (
// Replace with filtered version and add prefix display

// First, add state for showHiddenImages toggle (find the expandedImageTasks state)
const expandedStatePattern = /const \[expandedImageTasks, setExpandedImageTasks\] = useState<Set<string>>\(new Set\(\)\);/;
if (!content.includes('showHiddenImages')) {
  content = content.replace(
    expandedStatePattern,
    `const [expandedImageTasks, setExpandedImageTasks] = useState<Set<string>>(new Set()); // 이미지 확장 표시된 task
  const [showHiddenImages, setShowHiddenImages] = useState(false); // BTS-3059: 숨김 이미지 표시 여부`
  );
  console.log('Added showHiddenImages state');
}

// 3. Replace the rendering section for allImages.map
// Find: {allImages.map((file: any) => (
// We need to filter before map and add prefix display

// Find the section with "📁 전체 파일" and modify it
const oldAllImagesSection = `<p className="text-xs font-semibold text-slate-300 mb-2">
                                    📁 전체 파일 ({allImages.length}개)
                                  </p>
                                  <div className="grid grid-cols-4 gap-2">
                                    {allImages.map((file: any) => (`;

const newAllImagesSection = `<div className="flex items-center justify-between mb-2">
                                    <p className="text-xs font-semibold text-slate-300">
                                      📁 전체 파일 ({allImages.filter((f: any) => showHiddenImages || !isHiddenImage(f.filename)).length}개)
                                    </p>
                                    <label className="flex items-center gap-1 text-xs text-slate-400 cursor-pointer">
                                      <input
                                        type="checkbox"
                                        checked={showHiddenImages}
                                        onChange={(e) => setShowHiddenImages(e.target.checked)}
                                        className="w-3 h-3"
                                      />
                                      썸네일/훅 표시
                                    </label>
                                  </div>
                                  <div className="grid grid-cols-4 gap-2">
                                    {allImages.filter((f: any) => showHiddenImages || !isHiddenImage(f.filename)).map((file: any) => (`;

if (content.includes('📁 전체 파일 ({allImages.length}개)')) {
  content = content.replace(oldAllImagesSection, newAllImagesSection);
  console.log('Updated allImages rendering with filter and toggle');
}

// 4. Update the filename display to show prefix
// Find: {file.filename}
// in the context of the allImages section
// Change to show prefix/sceneId more prominently

const oldFilenameDisplay = `<div className="absolute bottom-0 left-0 right-0 bg-black/70 px-1 py-0.5 text-xs text-slate-200 truncate">
                                          {file.filename}
                                        </div>`;

const newFilenameDisplay = `<div className="absolute bottom-0 left-0 right-0 bg-black/70 px-1 py-0.5 text-xs text-slate-200 truncate" title={file.filename}>
                                          {extractImagePrefix(file.filename)}
                                        </div>`;

if (content.includes(oldFilenameDisplay)) {
  content = content.replace(oldFilenameDisplay, newFilenameDisplay);
  console.log('Updated filename display to show prefix');
}

fs.writeFileSync(filePath, content, 'utf-8');
console.log('Done! File patched successfully.');
