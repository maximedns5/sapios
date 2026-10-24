// Icônes du site public : traits arrondis, couleur héritée. Toujours décoratives (aria-hidden) :
// le libellé est porté par le texte ou l'aria-label du contrôle.

type IconProps = { size?: number; className?: string };

function Svg({ size = 20, className, children, filled = false, strokeWidth = 2.4 }: IconProps & { children: React.ReactNode; filled?: boolean; strokeWidth?: number }) {
  return (
    <svg
      aria-hidden="true"
      focusable="false"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill={filled ? "currentColor" : "none"}
      stroke={filled ? "none" : "currentColor"}
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      {children}
    </svg>
  );
}

export const ArrowRight = (p: IconProps) => (
  <Svg {...p}>
    <path d="M5 12h13M13 6l6 6-6 6" />
  </Svg>
);

export const ArrowLeft = (p: IconProps) => (
  <Svg {...p} strokeWidth={2.2}>
    <path d="M15 5l-7 7 7 7" />
  </Svg>
);

export const Close = (p: IconProps) => (
  <Svg {...p}>
    <path d="M6 6l12 12M18 6L6 18" />
  </Svg>
);

export const Check = (p: IconProps) => (
  <Svg {...p} strokeWidth={2.8}>
    <path d="M6 12.5l4 4 8-9" />
  </Svg>
);

export const Alert = (p: IconProps) => (
  <Svg {...p} strokeWidth={2.2}>
    <circle cx="12" cy="12" r="9" />
    <path d="M12 7.5v5.5M12 16.5v.01" />
  </Svg>
);

/** Symbole euro : « salaire affiché ». */
export const Salary = (p: IconProps) => (
  <Svg {...p} strokeWidth={2}>
    <path d="M17 6.5A7 7 0 1 0 17 17.5" />
    <path d="M4 10h9M4 14h9" />
  </Svg>
);

/** Œil barré : « CV sans photo ». */
export const EyeOff = (p: IconProps) => (
  <Svg {...p} strokeWidth={2}>
    <path d="M3 12s3.5-6 9-6c2 0 3.7.8 5 1.8M21 12s-3.5 6-9 6c-2 0-3.7-.8-5-1.8" />
    <path d="M4 20L20 4" />
  </Svg>
);

export const Clock = (p: IconProps) => (
  <Svg {...p} strokeWidth={2}>
    <circle cx="12" cy="12" r="9" />
    <path d="M12 7v5l3 2" />
  </Svg>
);

export const Lock = (p: IconProps) => (
  <Svg {...p} strokeWidth={2.2}>
    <rect x="5" y="11" width="14" height="9" rx="2" />
    <path d="M8 11V8a4 4 0 0 1 8 0v3" />
  </Svg>
);

export const MapPin = (p: IconProps) => (
  <Svg {...p} strokeWidth={2.2}>
    <path d="M12 21s-6.5-5.6-6.5-11a6.5 6.5 0 0 1 13 0c0 5.4-6.5 11-6.5 11z" />
    <circle cx="12" cy="10" r="2.4" />
  </Svg>
);

/** Rond plein à la couleur d'accent, coche blanche : « vérifié ». */
export function Verified({ size = 22 }: { size?: number }) {
  return (
    <svg aria-hidden="true" focusable="false" width={size} height={size} viewBox="0 0 24 24">
      <circle cx="12" cy="12" r="10" style={{ fill: "var(--accent)" }} />
      <path d="M7.5 12.5l3 3 6-6.5" fill="none" stroke="#FFFFFF" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
