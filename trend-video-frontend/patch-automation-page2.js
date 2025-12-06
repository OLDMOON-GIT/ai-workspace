const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, 'src/app/automation/page.tsx');
let content = fs.readFileSync(filePath, 'utf-8');

// Update the filename display to show prefix
// The current pattern (with exact whitespace)
const oldFilenameDisplay = `                                        <div className="absolute bottom-0 left-0 right-0 bg-black/70 px-1 py-0.5 text-xs text-slate-200 truncate">
                                          {file.filename}
                                        </div>`;

const newFilenameDisplay = `                                        <div className="absolute bottom-0 left-0 right-0 bg-black/70 px-1 py-0.5 text-xs text-slate-200 truncate" title={file.filename}>
                                          {extractImagePrefix(file.filename)}
                                        </div>`;

if (content.includes(oldFilenameDisplay)) {
  content = content.replace(oldFilenameDisplay, newFilenameDisplay);
  console.log('Updated filename display to show prefix');
} else {
  console.log('Old filename display pattern not found');
  // Try a simpler pattern
  const simpleOld = '{file.filename}\n                                        </div>\n                                      </div>\n                                    ))}\n                                  </div>\n                                </div>';
  if (content.includes('{file.filename}')) {
    // Replace with regex
    content = content.replace(
      /(<div className="absolute bottom-0 left-0 right-0 bg-black\/70 px-1 py-0\.5 text-xs text-slate-200 truncate">)\s*\n\s*(\{file\.filename\})\s*\n\s*(<\/div>)\s*\n(\s*<\/div>)\s*\n(\s*\)\)\})/,
      '$1 title={file.filename}\n                                          {extractImagePrefix(file.filename)}\n                                        $3\n$4\n$5'
    );
    console.log('Used regex replacement');
  }
}

fs.writeFileSync(filePath, content, 'utf-8');
console.log('Done!');
