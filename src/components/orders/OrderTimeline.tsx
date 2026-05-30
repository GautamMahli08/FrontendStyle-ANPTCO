'use client';

import { getOrderTimeline, shortOrderId, type OrderEvent, type OrderEventTone } from '@/src/lib/demo-data';

/**
 * OrderTimeline — chronological event feed for a single order (placed → accepted →
 * assigned → en route → arrived → delivered), with any fuel anomalies merged in.
 * Shared by the seller and transporter order views so both see the same history.
 */

const TONE_DOT: Record<OrderEventTone, string> = {
  default: 'bg-slate-300',
  active:  'bg-blue-500',
  success: 'bg-emerald-500',
  alert:   'bg-red-500',
};
const TONE_TEXT: Record<OrderEventTone, string> = {
  default: 'text-gray-800',
  active:  'text-blue-700',
  success: 'text-emerald-700',
  alert:   'text-red-700',
};

function fmtTime(d?: Date) {
  if (!d) return null;
  return new Date(d).toLocaleString('en-GB', {
    day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit',
  });
}

export default function OrderTimeline({
  order,
  showHeader = true,
}: {
  order: any;
  showHeader?: boolean;
}) {
  const events: OrderEvent[] = getOrderTimeline(order);

  if (events.length === 0) {
    return <p className="text-xs text-gray-400">No events yet.</p>;
  }

  return (
    <div>
      {showHeader && (
        <p className="text-xs font-bold text-gray-400 uppercase tracking-wide mb-3">
          Event Timeline · #{shortOrderId(order.id)}
        </p>
      )}
      <ol className="relative">
        {events.map((e, i) => {
          const isLast = i === events.length - 1;
          return (
            <li key={e.key} className="relative flex gap-3 pb-2.5 last:pb-0">
              {/* Connector line */}
              {!isLast && <span className="absolute left-[6px] top-3.5 bottom-0 w-px bg-gray-200" aria-hidden />}
              {/* Dot */}
              <span className={`relative z-10 mt-1 w-3 h-3 rounded-full flex-shrink-0 ring-2 ring-white ${TONE_DOT[e.tone]}`} />
              {/* Content */}
              <div className="flex-1 min-w-0 -mt-0.5">
                <div className="flex items-baseline justify-between gap-2">
                  <p className={`text-sm font-semibold ${TONE_TEXT[e.tone]}`}>
                    <span className="mr-1">{e.icon}</span>{e.label}
                  </p>
                  {fmtTime(e.at) && (
                    <span className="text-[11px] text-gray-400 flex-shrink-0 whitespace-nowrap">{fmtTime(e.at)}</span>
                  )}
                </div>
                {e.detail && <p className="text-xs text-gray-500 mt-0.5 truncate">{e.detail}</p>}
              </div>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
