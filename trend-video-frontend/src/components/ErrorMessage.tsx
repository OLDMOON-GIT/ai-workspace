/**
 * 복사 가능한 에러 메시지 컴포넌트
 */

'use client';

import { useState } from 'react';

interface ErrorMessageProps {
  message: string;
}

export default function ErrorMessage({ message }: ErrorMessageProps) {
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    navigator.clipboard.writeText(message).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  return (
    <div className="relative group mt-3 rounded-lg bg-red-500/20 border border-red-500/30 p-3 text-sm">
      <div className="flex items-start justify-between gap-2">
        <pre className="flex-1 text-red-300 whitespace-pre-wrap break-words font-mono text-xs select-text">
          {message}
        </pre>
        <button
          onClick={handleCopy}
          className="flex-shrink-0 rounded px-2 py-1 text-xs bg-red-500/30 hover:bg-red-500/50 text-red-200 transition-colors"
          title="에러 메시지 복사"
        >
          {copied ? '✓ 복사됨' : '📋 복사'}
        </button>
      </div>
    </div>
  );
}
