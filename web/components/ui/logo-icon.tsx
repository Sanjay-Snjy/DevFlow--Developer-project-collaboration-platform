export function LogoIcon({ size = 28, className }: { size?: number; className?: string }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 32 32"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      style={{ flexShrink: 0 }}
    >
      <defs>
        <linearGradient id="df-grad-stroke" x1="0" y1="32" x2="32" y2="0" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#7c5cff" />
          <stop offset="100%" stopColor="#4f8dff" />
        </linearGradient>
        <linearGradient id="df-grad-fill" x1="0" y1="0" x2="32" y2="32" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#7c5cff" stopOpacity="0.22" />
          <stop offset="100%" stopColor="#4f8dff" stopOpacity="0.22" />
        </linearGradient>
      </defs>
      <rect width="32" height="32" rx="8" fill="url(#df-grad-fill)" stroke="rgba(255,255,255,0.08)" strokeWidth="1" />
      <path
        d="M8.5 7.5H15A7.5 7.5 0 0 1 22.5 15V17A7.5 7.5 0 0 1 15 24.5H8.5A1.5 1.5 0 0 1 7 23V9A1.5 1.5 0 0 1 8.5 7.5Z"
        stroke="url(#df-grad-stroke)"
        strokeWidth="2.2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M12.5 11.5L17.5 16L12.5 20.5"
        stroke="#ffffff"
        strokeWidth="2.2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
