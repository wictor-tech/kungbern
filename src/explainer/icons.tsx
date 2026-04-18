type IconProps = { size?: number; color?: string; strokeWidth?: number };

const base = (size: number, strokeWidth: number): React.SVGProps<SVGSVGElement> => ({
  width: size,
  height: size,
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth,
  strokeLinecap: "round",
  strokeLinejoin: "round",
});

export const TruckIcon: React.FC<IconProps> = ({ size = 48, color = "currentColor", strokeWidth = 2 }) => (
  <svg {...base(size, strokeWidth)} style={{ color }}>
    <path d="M1 4h13v11H1z" />
    <path d="M14 8h4l3 3v4h-7" />
    <circle cx="5.5" cy="17.5" r="2.5" fill="currentColor" />
    <circle cx="17.5" cy="17.5" r="2.5" fill="currentColor" />
  </svg>
);

export const ShieldIcon: React.FC<IconProps> = ({ size = 48, color = "currentColor", strokeWidth = 2 }) => (
  <svg {...base(size, strokeWidth)} style={{ color }}>
    <path d="M12 2 4 5v6c0 5 3.5 8.5 8 11 4.5-2.5 8-6 8-11V5l-8-3Z" />
    <path d="m9 12 2 2 4-4" />
  </svg>
);

export const ClockIcon: React.FC<IconProps> = ({ size = 48, color = "currentColor", strokeWidth = 2 }) => (
  <svg {...base(size, strokeWidth)} style={{ color }}>
    <circle cx="12" cy="12" r="9" />
    <path d="M12 7v5l3 2" />
  </svg>
);

export const BoltIcon: React.FC<IconProps> = ({ size = 48, color = "currentColor", strokeWidth = 2 }) => (
  <svg {...base(size, strokeWidth)} style={{ color }}>
    <path d="M13 2 4 14h7l-1 8 9-12h-7l1-8Z" />
  </svg>
);

export const ChartIcon: React.FC<IconProps> = ({ size = 48, color = "currentColor", strokeWidth = 2 }) => (
  <svg {...base(size, strokeWidth)} style={{ color }}>
    <path d="M3 3v18h18" />
    <path d="M7 15l4-4 3 3 5-6" />
  </svg>
);

export const CheckIcon: React.FC<IconProps> = ({ size = 24, color = "currentColor", strokeWidth = 3 }) => (
  <svg {...base(size, strokeWidth)} style={{ color }}>
    <path d="m5 12 5 5L20 7" />
  </svg>
);

export const ClipboardIcon: React.FC<IconProps> = ({ size = 48, color = "currentColor", strokeWidth = 2 }) => (
  <svg {...base(size, strokeWidth)} style={{ color }}>
    <rect x="5" y="4" width="14" height="17" rx="2" />
    <path d="M9 4V2h6v2" />
    <path d="M8 10h8M8 14h5" />
  </svg>
);

export const ScreenIcon: React.FC<IconProps> = ({ size = 48, color = "currentColor", strokeWidth = 2 }) => (
  <svg {...base(size, strokeWidth)} style={{ color }}>
    <rect x="2" y="3" width="20" height="14" rx="2" />
    <path d="M8 21h8M12 17v4" />
  </svg>
);

export const CloudIcon: React.FC<IconProps> = ({ size = 48, color = "currentColor", strokeWidth = 2 }) => (
  <svg {...base(size, strokeWidth)} style={{ color }}>
    <path d="M7 18a5 5 0 0 1-.5-9.9A6 6 0 0 1 18 9a4.5 4.5 0 0 1 .5 9H7Z" />
  </svg>
);

export const ArrowRightIcon: React.FC<IconProps> = ({ size = 24, color = "currentColor", strokeWidth = 2.5 }) => (
  <svg {...base(size, strokeWidth)} style={{ color }}>
    <path d="M5 12h14M13 6l6 6-6 6" />
  </svg>
);
