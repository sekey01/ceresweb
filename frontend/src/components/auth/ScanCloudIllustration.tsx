// Decorative, looping illustration for the login page — a white illustration
// on the blue brand panel. A stationary paper sits in the scanner: dotted
// rays sweep down across it (the scan), then a second set of dotted rays
// travel up to the cloud (the upload), where CERES appears. Pure SVG/CSS.
export default function ScanCloudIllustration() {
  return (
    <div className="relative w-full max-w-xs mx-auto" aria-hidden="true">
      <svg viewBox="0 0 300 400" className="w-full h-auto overflow-visible">
        <defs>
          <radialGradient id="ceresGlow" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="#FFFFFF" stopOpacity="0.35" />
            <stop offset="100%" stopColor="#FFFFFF" stopOpacity="0" />
          </radialGradient>
          <clipPath id="paperClip">
            <rect x="115" y="190" width="70" height="86" rx="6" />
          </clipPath>
        </defs>

        {/* Ambient glow behind the cloud */}
        <circle cx="150" cy="90" r="95" fill="url(#ceresGlow)" />

        {/* Cloud */}
        <g
          className="animate-scan-cloud-pulse"
          style={{ transformBox: 'fill-box', transformOrigin: 'center' }}
        >
          <rect x="100" y="70" width="100" height="36" rx="18" fill="#FFFFFF" />
          <circle cx="120" cy="68" r="22" fill="#FFFFFF" />
          <circle cx="150" cy="56" r="28" fill="#FFFFFF" />
          <circle cx="181" cy="68" r="20" fill="#FFFFFF" />
        </g>

        {/* CERES wordmark, appears once the upload rays arrive */}
        <text
          x="150"
          y="127"
          textAnchor="middle"
          className="animate-scan-text"
          style={{
            transformBox: 'fill-box',
            transformOrigin: 'center',
            fontFamily: 'Inter, system-ui, sans-serif',
            fontWeight: 700,
            fontSize: '22px',
            letterSpacing: '4px',
            fill: '#FFFFFF',
          }}
        >
          CERES
        </text>

        {/* Upload rays — dotted lines carrying the scan up to the cloud */}
        <g
          className="animate-upload-rays"
          stroke="#FFFFFF"
          strokeOpacity="0.9"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeDasharray="1 8"
        >
          <line x1="128" y1="188" x2="138" y2="112" />
          <line x1="150" y1="188" x2="150" y2="108" />
          <line x1="172" y1="188" x2="162" y2="112" />
        </g>

        {/* Scanner base glow */}
        <ellipse cx="150" cy="320" rx="70" ry="8" fill="#FFFFFF" opacity="0.08" />

        {/* Scanner body — white, shaded with opacity for depth */}
        <rect x="85" y="262" width="130" height="50" rx="10" fill="#FFFFFF" opacity="0.85" />
        <rect x="97" y="256" width="106" height="14" rx="6" fill="#FFFFFF" />
        <circle cx="103" cy="300" r="3" fill="#FFFFFF" opacity="0.5" />
        <circle cx="115" cy="300" r="3" fill="#FFFFFF" opacity="0.5" />

        {/* Paper — stays put; the rays do the work */}
        <rect x="115" y="190" width="70" height="86" rx="6" fill="#FFFFFF" stroke="#FFFFFF" strokeOpacity="0.4" strokeWidth="2" />
        <rect x="126" y="206" width="48" height="5" rx="2.5" fill="#9CA3AF" />
        <rect x="126" y="218" width="48" height="5" rx="2.5" fill="#9CA3AF" />
        <rect x="126" y="230" width="34" height="5" rx="2.5" fill="#9CA3AF" />
        <rect x="126" y="246" width="40" height="5" rx="2.5" fill="#9CA3AF" />
        <rect x="126" y="258" width="26" height="5" rx="2.5" fill="#9CA3AF" />

        {/* Scan rays — dotted, sweep down across the paper's surface.
            Gray, not white, so they stay visible against the white paper. */}
        <g clipPath="url(#paperClip)">
          <g
            className="animate-scan-rays"
            stroke="#6B7280"
            strokeLinecap="round"
          >
            <line x1="119" y1="196" x2="181" y2="196" strokeWidth="3" strokeDasharray="1 7" />
            <line x1="126" y1="200" x2="126" y2="212" strokeWidth="2" strokeDasharray="1 5" />
            <line x1="140" y1="200" x2="140" y2="214" strokeWidth="2" strokeDasharray="1 5" />
            <line x1="160" y1="200" x2="160" y2="214" strokeWidth="2" strokeDasharray="1 5" />
            <line x1="174" y1="200" x2="174" y2="212" strokeWidth="2" strokeDasharray="1 5" />
          </g>
        </g>
      </svg>
    </div>
  );
}
