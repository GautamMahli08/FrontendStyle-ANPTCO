'use client';

/**
 * NetworkMap — a decorative, animated grid background for the landing page.
 *
 * A faint blueprint-style grid fills the screen; a central origin hub connects to
 * several destination nodes, and a coloured "shipment" dot flows along each route
 * from origin → destination on a loop. As a dot arrives, a small pulse fires at the
 * destination — an abstract stand-in for live deliveries across a logistics network.
 *
 * The SVG fills its container (preserveAspectRatio="slice"), so it covers the whole
 * viewport regardless of aspect ratio.
 */

type Pt = { x: number; y: number };

// Origin (Fuel Depot) sits in the lower third, centred, so it appears just below the
// login personas (never behind them) while staying clear of the wide-screen crop.
// Routes run out sideways, then up the margins to the cities.
const HUB: Pt = { x: 600, y: 525 };

// Destinations live in the left/right margins + corners — never the centre.
// Labelled with Omani cities (positions are decorative, not geographic).
const NODES: Array<Pt & { color: string; dur: number; begin: number; name: string }> = [
  { x: 270,  y: 120, color: '#3b82f6', dur: 7.0, begin: 0.0, name: 'Sohar'   },
  { x: 95,   y: 310, color: '#0ea5e9', dur: 6.5, begin: 2.6, name: 'Buraimi' },
  { x: 300,  y: 500, color: '#f97316', dur: 8.5, begin: 2.0, name: 'Nizwa'   },
  { x: 935,  y: 120, color: '#06b6d4', dur: 8.0, begin: 1.2, name: 'Khasab'  },
  { x: 1120, y: 310, color: '#22c55e', dur: 7.2, begin: 0.3, name: 'Sur'     },
  { x: 905,  y: 500, color: '#8b5cf6', dur: 7.5, begin: 1.6, name: 'Ibri'    },
];

/** Orthogonal "elbow" route from a → b: a straight horizontal run out of the depot,
 *  then a straight vertical run into the destination — no curves. */
function routePath(a: Pt, b: Pt): string {
  return `M ${a.x} ${a.y} L ${b.x} ${a.y} L ${b.x} ${b.y}`;
}

export default function NetworkMap({ className = '' }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 1200 700"
      preserveAspectRatio="xMidYMid slice"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden
    >
      <defs>
        {/* Soft canvas */}
        <radialGradient id="nmBg" cx="50%" cy="42%" r="80%">
          <stop offset="0%" stopColor="#f5f9ff" />
          <stop offset="70%" stopColor="#eef4fb" />
          <stop offset="100%" stopColor="#e9eef5" />
        </radialGradient>

        {/* Blueprint grid */}
        <pattern id="nmGrid" width="44" height="44" patternUnits="userSpaceOnUse">
          <path d="M 44 0 L 0 0 0 44" fill="none" stroke="#3b82f6" strokeWidth="1" opacity="0.07" />
        </pattern>
        {/* Brighter accent lines every 4th cell */}
        <pattern id="nmGridMajor" width="176" height="176" patternUnits="userSpaceOnUse">
          <path d="M 176 0 L 0 0 0 176" fill="none" stroke="#3b82f6" strokeWidth="1.2" opacity="0.08" />
        </pattern>
      </defs>

      {/* Canvas + grid */}
      <rect width="1200" height="700" fill="url(#nmBg)" />
      <rect width="1200" height="700" fill="url(#nmGrid)" />
      <rect width="1200" height="700" fill="url(#nmGridMajor)" />

      {/* Routes (faint) */}
      {NODES.map((n, i) => (
        <path
          key={`r${i}`}
          d={routePath(HUB, n)}
          fill="none"
          stroke="#60a5fa"
          strokeWidth="1.4"
          strokeDasharray="5,6"
          opacity="0.28"
        />
      ))}

      {/* Destination nodes + arrival pulse */}
      {NODES.map((n, i) => (
        <g key={`n${i}`}>
          {/* arrival pulse — fires as the dot reaches the node */}
          <circle cx={n.x} cy={n.y} r="4" fill="none" stroke={n.color} strokeWidth="2" opacity="0">
            <animate attributeName="r" values="4;4;20;20" dur={`${n.dur}s`} begin={`${n.begin}s`} repeatCount="indefinite" keyTimes="0;0.8;0.97;1" />
            <animate attributeName="opacity" values="0;0;0.6;0" dur={`${n.dur}s`} begin={`${n.begin}s`} repeatCount="indefinite" keyTimes="0;0.8;0.88;1" />
          </circle>
          <circle cx={n.x} cy={n.y} r="5" fill="white" stroke={n.color} strokeWidth="2.5" />
          <circle cx={n.x} cy={n.y} r="2" fill={n.color} />
          <text x={n.x} y={n.y + 18} textAnchor="middle" fontSize="11" fontWeight="600" fill="#475569" fontFamily="sans-serif">{n.name}</text>
        </g>
      ))}

      {/* Flowing shipment dots: origin → destination on a loop */}
      {NODES.map((n, i) => (
        <g key={`d${i}`}>
          {/* trailing glow */}
          <circle r="8" fill={n.color} opacity="0">
            <animate attributeName="opacity" values="0;0.18;0.18;0.18;0" dur={`${n.dur}s`} begin={`${n.begin}s`} repeatCount="indefinite" keyTimes="0;0.06;0.5;0.85;1" />
            <animateMotion dur={`${n.dur}s`} begin={`${n.begin}s`} repeatCount="indefinite" path={routePath(HUB, n)} />
          </circle>
          {/* dot */}
          <circle r="4" fill={n.color} stroke="white" strokeWidth="1.5" opacity="0">
            <animate attributeName="opacity" values="0;1;1;1;0" dur={`${n.dur}s`} begin={`${n.begin}s`} repeatCount="indefinite" keyTimes="0;0.06;0.5;0.85;1" />
            <animateMotion dur={`${n.dur}s`} begin={`${n.begin}s`} repeatCount="indefinite" path={routePath(HUB, n)} />
          </circle>
        </g>
      ))}

      {/* Central origin hub */}
      <circle cx={HUB.x} cy={HUB.y} r="10" fill="none" stroke="#2563eb" strokeWidth="1.5">
        <animate attributeName="r" values="10;26;10" dur="3s" repeatCount="indefinite" />
        <animate attributeName="opacity" values="0.4;0;0.4" dur="3s" repeatCount="indefinite" />
      </circle>
      <circle cx={HUB.x} cy={HUB.y} r="9" fill="#2563eb" stroke="white" strokeWidth="3" />
      <circle cx={HUB.x} cy={HUB.y} r="3.5" fill="white" />
      <text x={HUB.x} y={HUB.y + 26} textAnchor="middle" fontSize="13" fontWeight="700" fill="#1e3a8a" fontFamily="sans-serif">⛽ Fuel Depot</text>
    </svg>
  );
}
