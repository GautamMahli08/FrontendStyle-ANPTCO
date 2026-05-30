'use client';

/**
 * OmanLiveMap — a decorative, animated SVG map of Oman used as the landing-page
 * background. A soft light canvas showing the ANPTCO depot (Muscat), the main
 * delivery cities, and three trucks driving their routes on a loop. As each truck
 * arrives, a small emerald "delivered" pulse + check briefly appears at the
 * destination — communicating live deliveries without bulky popups.
 *
 * City/route coordinates live in their own space; a single wrapping transform scales
 * and positions the whole country to fit the landscape viewBox, so the full
 * north→south span (Musandam down to Salalah) stays visible without clipping.
 */
export default function OmanLiveMap({ className = '' }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 1000 600"
      preserveAspectRatio="xMidYMid slice"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden
    >
      <defs>
        {/* Soft sky canvas */}
        <radialGradient id="bgGrad" cx="55%" cy="40%" r="85%">
          <stop offset="0%" stopColor="#f0f9ff" />
          <stop offset="60%" stopColor="#eff6ff" />
          <stop offset="100%" stopColor="#eef2f7" />
        </radialGradient>

        {/* Subtle land gradient */}
        <linearGradient id="landGrad" x1="0" y1="0" x2="0.6" y2="1">
          <stop offset="0%" stopColor="#dbeafe" />
          <stop offset="100%" stopColor="#bfdbfe" />
        </linearGradient>

        {/* Route paths — defined in country-local coords, shift applied by wrapper group */}
        <path id="rt1" d="M 348 185 C 385 182, 415 178, 448 182 C 490 187, 536 205, 573 230" />
        <path id="rt2" d="M 573 230 C 598 248, 624 270, 648 295 C 655 308, 658 318, 655 330" />
        <path id="rt3" d="M 573 230 C 552 250, 526 268, 502 278 C 478 290, 462 330, 450 375
           C 438 420, 430 455, 422 480 C 408 516, 385 550, 358 580 C 335 605, 308 630, 278 652" />
        <path id="rt3r" d="M 278 652 C 308 630, 335 605, 358 580 C 385 550, 408 516, 422 480
           C 430 455, 438 420, 450 375 C 462 330, 478 290, 502 278 C 526 268, 552 250, 573 230" />
      </defs>

      {/* Canvas */}
      <rect width="1000" height="600" fill="url(#bgGrad)" />

      {/* ── Whole country scaled + positioned to fit the landscape viewBox ── */}
      <g transform="translate(190, 25) scale(0.78)">

        {/* Neighbouring land: Saudi / UAE */}
        <path d="M 0 0 L 250 0 L 280 40 L 340 60 L 340 185 L 250 220 L 200 300 L 150 450 L 100 600 L 0 680 Z"
          fill="#f1f5f9" stroke="#cbd5e1" strokeWidth="0.8" />
        <path d="M 340 60 L 380 35 L 430 20 L 460 30 L 448 80 L 420 100 L 380 110 L 348 185"
          fill="#f1f5f9" stroke="#cbd5e1" strokeWidth="0.8" />
        <text x="130" y="120" fontSize="9" fill="#94a3b8" fontFamily="sans-serif" opacity="0.6" transform="rotate(-5,130,120)">UAE</text>
        <text x="60" y="300" fontSize="9" fill="#94a3b8" fontFamily="sans-serif" opacity="0.55" transform="rotate(-8,60,300)">Saudi Arabia</text>

        {/* Musandam exclave */}
        <path d="M 390 28 C 406 12, 432 8, 450 16 C 466 24, 472 44, 465 60
           C 458 75, 440 84, 422 82 C 404 78, 392 64, 388 48 Z"
          fill="url(#landGrad)" stroke="#60a5fa" strokeWidth="1.2" opacity="0.7" />
        <text x="428" y="100" textAnchor="middle" fontSize="7.5" fill="#3b82f6" fontFamily="sans-serif" opacity="0.65">Musandam</text>

        {/* Oman main body */}
        <path d="M 348 185
           C 388 180, 422 176, 452 180 C 492 185, 538 204, 573 230
           C 592 244, 614 260, 632 275 C 647 288, 658 302, 658 320
           C 657 338, 647 358, 636 378 C 622 402, 604 424, 584 446
           C 562 470, 537 492, 512 514 C 489 534, 465 554, 442 572
           C 416 592, 389 614, 362 636 C 340 654, 312 667, 276 654
           C 254 646, 232 652, 208 662 C 190 670, 172 670, 158 660
           C 144 648, 140 630, 144 612 C 148 592, 157 568, 166 544
           C 176 516, 187 486, 196 457 C 206 425, 212 395, 220 365
           C 230 332, 246 302, 266 276 C 284 252, 305 234, 328 217
           C 337 210, 344 198, 348 185 Z"
          fill="url(#landGrad)" stroke="#60a5fa" strokeWidth="1.4" opacity="0.75" />

        {/* Hajar Mountains range hint */}
        <path d="M 370 165 L 382 155 L 394 163 L 408 152 L 422 162 L 436 150
           L 450 160 L 464 148 L 478 158 L 492 168 L 508 156 L 522 168 L 536 178"
          fill="none" stroke="#60a5fa" strokeWidth="1" opacity="0.25" strokeLinejoin="round" />

        {/* Sea labels */}
        <text x="668" y="185" fontSize="9.5" fill="#38bdf8" fontFamily="sans-serif" opacity="0.65" transform="rotate(14,668,185)">Gulf of Oman</text>
        <text x="78" y="390" fontSize="9" fill="#94a3b8" fontFamily="sans-serif" opacity="0.45" transform="rotate(-17,78,390)">Empty Quarter</text>
        <text x="118" y="690" fontSize="9" fill="#38bdf8" fontFamily="sans-serif" opacity="0.55">Arabian Sea</text>

        {/* Road network */}
        <use href="#rt1" fill="none" stroke="#2563eb" strokeWidth="1.5" strokeDasharray="5,4" opacity="0.22" />
        <use href="#rt2" fill="none" stroke="#2563eb" strokeWidth="1.5" strokeDasharray="5,4" opacity="0.22" />
        <use href="#rt3" fill="none" stroke="#2563eb" strokeWidth="1.5" strokeDasharray="5,4" opacity="0.2" />

        {/* ── City markers ── */}

        {/* Muscat — pulsing depot */}
        <circle cx="573" cy="230" r="8" fill="none" stroke="#059669" strokeWidth="1">
          <animate attributeName="r" values="8;22;8" dur="3s" repeatCount="indefinite" />
          <animate attributeName="opacity" values="0.3;0;0.3" dur="3s" repeatCount="indefinite" />
        </circle>
        <circle cx="573" cy="230" r="6" fill="#10b981" stroke="white" strokeWidth="2" opacity="0.95" />
        <text x="583" y="225" fontSize="9" fontWeight="bold" fill="#065f46" fontFamily="sans-serif" opacity="0.8">Muscat</text>
        <text x="583" y="237" fontSize="7" fill="#64748b" fontFamily="sans-serif" opacity="0.65">ANPTCO Depot</text>

        <circle cx="448" cy="182" r="4" fill="#3b82f6" stroke="white" strokeWidth="1.5" opacity="0.6" />
        <text x="454" y="177" fontSize="8" fill="#1e40af" fontFamily="sans-serif" opacity="0.65">Sohar</text>
        <circle cx="502" cy="278" r="3.5" fill="#3b82f6" stroke="white" strokeWidth="1.5" opacity="0.55" />
        <text x="510" y="273" fontSize="8" fill="#1e40af" fontFamily="sans-serif" opacity="0.6">Nizwa</text>
        <circle cx="655" cy="320" r="3.5" fill="#3b82f6" stroke="white" strokeWidth="1.5" opacity="0.5" />
        <text x="643" y="315" fontSize="8" fill="#1e40af" fontFamily="sans-serif" textAnchor="end" opacity="0.55">Sur</text>
        <circle cx="276" cy="654" r="4" fill="#3b82f6" stroke="white" strokeWidth="1.5" opacity="0.55" />
        <text x="284" y="649" fontSize="8" fill="#1e40af" fontFamily="sans-serif" opacity="0.6">Salalah</text>
        <circle cx="348" cy="185" r="3.5" fill="#3b82f6" stroke="white" strokeWidth="1.5" opacity="0.45" />
        <text x="338" y="180" fontSize="8" fill="#1e40af" fontFamily="sans-serif" textAnchor="end" opacity="0.5">Buraimi</text>

        {/* ══════════════════════════════════
            TRUCKS — show live deliveries in progress
        ══════════════════════════════════ */}

        {/* Truck 1: Buraimi → Muscat (emerald, 12s) */}
        <g>
          <circle r="5" fill="#10b981" stroke="white" strokeWidth="1.5" />
          <circle r="9" fill="none" stroke="#10b981" strokeWidth="1" opacity="0.4">
            <animate attributeName="r" values="5;13;5" dur="2s" repeatCount="indefinite" />
            <animate attributeName="opacity" values="0.5;0;0.5" dur="2s" repeatCount="indefinite" />
          </circle>
          <animateMotion dur="12s" repeatCount="indefinite" rotate="auto" keyPoints="0;1;1;1" keyTimes="0;0.75;0.92;1" calcMode="linear">
            <mpath href="#rt1" />
          </animateMotion>
        </g>

        {/* Truck 2: Muscat → Sur (cyan, 10s, begin 2s) */}
        <g>
          <circle r="5" fill="#06b6d4" stroke="white" strokeWidth="1.5" />
          <circle r="9" fill="none" stroke="#06b6d4" strokeWidth="1" opacity="0.4">
            <animate attributeName="r" values="5;13;5" dur="2.2s" repeatCount="indefinite" begin="0.5s" />
            <animate attributeName="opacity" values="0.5;0;0.5" dur="2.2s" repeatCount="indefinite" begin="0.5s" />
          </circle>
          <animateMotion dur="10s" repeatCount="indefinite" rotate="auto" begin="2s" keyPoints="0;1;1;1" keyTimes="0;0.75;0.9;1" calcMode="linear">
            <mpath href="#rt2" />
          </animateMotion>
        </g>

        {/* Truck 3: Muscat → Salalah (amber, 20s, begin 4s) */}
        <g>
          <circle r="5" fill="#f97316" stroke="white" strokeWidth="1.5" />
          <circle r="9" fill="none" stroke="#f97316" strokeWidth="1" opacity="0.35">
            <animate attributeName="r" values="5;13;5" dur="2.5s" repeatCount="indefinite" begin="1s" />
            <animate attributeName="opacity" values="0.4;0;0.4" dur="2.5s" repeatCount="indefinite" begin="1s" />
          </circle>
          <animateMotion dur="20s" repeatCount="indefinite" rotate="auto" begin="4s" keyPoints="0;1;1;1" keyTimes="0;0.75;0.90;1" calcMode="linear">
            <mpath href="#rt3" />
          </animateMotion>
        </g>

        {/* Return truck: Salalah → Muscat (violet, dimmer) */}
        <g opacity="0.45">
          <circle r="4" fill="#8b5cf6" stroke="white" strokeWidth="1" />
          <animateMotion dur="18s" repeatCount="indefinite" rotate="auto" begin="12s" keyPoints="0;1" keyTimes="0;1" calcMode="linear">
            <mpath href="#rt3r" />
          </animateMotion>
        </g>

        {/* ══════════════════════════════════
            DELIVERED MARKERS — small pulse + check on arrival.
            Compact (r≈7–24) so they read as map pins, never bulky popups.
        ══════════════════════════════════ */}

        {/* Muscat delivery (synced with Truck 1 arrival, t≈9–10s of 12s) */}
        <DeliveredPin cx={573} cy={230} dur="12s" begin="0s" keyTimes="0;0.74;0.80;0.92;1" />
        {/* Sur delivery (Truck 2, begin 2s, 10s) */}
        <DeliveredPin cx={655} cy={320} dur="10s" begin="2s" keyTimes="0;0.74;0.81;0.93;1" />
        {/* Salalah delivery (Truck 3, begin 4s, 20s) */}
        <DeliveredPin cx={276} cy={654} dur="20s" begin="4s" keyTimes="0;0.74;0.79;0.93;1" />

      </g>{/* end country transform */}
    </svg>
  );
}

/** Small, transient "delivered" indicator: an expanding ring + a green check badge. */
function DeliveredPin({ cx, cy, dur, begin, keyTimes }: {
  cx: number; cy: number; dur: string; begin: string; keyTimes: string;
}) {
  const kt = keyTimes.split(';');
  return (
    <g>
      {/* expanding success ring (values aligned 1:1 with the 5 keyTimes) */}
      <circle cx={cx} cy={cy} r="6" fill="none" stroke="#10b981" strokeWidth="2" opacity="0">
        <animate attributeName="r" values="6;6;12;24;24" dur={dur} begin={begin} repeatCount="indefinite" keyTimes={keyTimes} />
        <animate attributeName="opacity" values="0;0;0.7;0;0" dur={dur} begin={begin} repeatCount="indefinite" keyTimes={keyTimes} />
      </circle>
      {/* check badge */}
      <g opacity="0">
        <circle cx={cx} cy={cy} r="7" fill="#10b981" stroke="white" strokeWidth="1.5" />
        <text x={cx} y={cy + 2.5} textAnchor="middle" fontSize="8" fontWeight="bold" fill="white" fontFamily="sans-serif">✓</text>
        <animate attributeName="opacity" values="0;0;1;1;0" dur={dur} begin={begin} repeatCount="indefinite" keyTimes={`0;${kt[1]};${kt[2]};0.95;1`} />
      </g>
    </g>
  );
}
