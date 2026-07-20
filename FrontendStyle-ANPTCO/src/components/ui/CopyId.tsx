'use client';

import { useState } from 'react';

/**
 * An identifier shown with a one-click copy button. `value` is what gets copied;
 * `label` is what's displayed (defaults to value). Stops click propagation so it
 * can sit safely inside clickable rows.
 */
export default function CopyId({
  value,
  label,
  className = '',
  mono = false,
}: {
  value: string;
  label?: string;
  className?: string;
  mono?: boolean;
}) {
  const [copied, setCopied] = useState(false);

  const copy = (e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    navigator.clipboard?.writeText(value).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1200);
    }).catch(() => {});
  };

  return (
    <span className={`inline-flex items-center gap-1 ${className}`}>
      <span className={mono ? 'font-mono' : ''}>{label ?? value}</span>
      <button
        type="button"
        onClick={copy}
        title={copied ? 'Copied!' : `Copy ${value}`}
        className={`transition ${copied ? 'text-emerald-500' : 'text-gray-300 hover:text-gray-600'}`}
      >
        {copied ? (
          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
          </svg>
        ) : (
          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7v8a2 2 0 002 2h6M8 7V5a2 2 0 012-2h4.586a1 1 0 01.707.293l4.414 4.414a1 1 0 01.293.707V15a2 2 0 01-2 2h-2M8 7H6a2 2 0 00-2 2v10a2 2 0 002 2h6a2 2 0 002-2v-2" />
          </svg>
        )}
      </button>
    </span>
  );
}
