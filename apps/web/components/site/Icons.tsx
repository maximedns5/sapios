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

export const Heart = (p: IconProps) => (
  <Svg {...p} filled>
    <path d="M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.6-7 10-7 10z" />
  </Svg>
);

export const Share = (p: IconProps) => (
  <Svg {...p} strokeWidth={2.2}>
    <path d="M12 15V3M7 8l5-5 5 5" />
    <path d="M5 13v6a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-6" />
  </Svg>
);

export const Download = (p: IconProps) => (
  <Svg {...p} strokeWidth={2.2}>
    <path d="M12 3v12M7 10l5 5 5-5" />
    <path d="M5 21h14" />
  </Svg>
);

export const Alert = (p: IconProps) => (
  <Svg {...p} strokeWidth={2.2}>
    <circle cx="12" cy="12" r="9" />
    <path d="M12 7.5v5.5M12 16.5v.01" />
  </Svg>
);

export const Timer = (p: IconProps) => (
  <Svg {...p}>
    <circle cx="12" cy="13" r="8" />
    <path d="M12 13V9M10 2h4" />
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

/** Rond en filet à la couleur d'accent : « accès, avec limites ». */
export function Partial({ size = 22 }: { size?: number }) {
  return (
    <svg aria-hidden="true" focusable="false" width={size} height={size} viewBox="0 0 24 24">
      <circle cx="12" cy="12" r="9.2" fill="none" strokeWidth="1.8" style={{ stroke: "var(--accent)" }} />
      <path d="M7.5 12.5l3 3 6-6.5" fill="none" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" style={{ stroke: "var(--accent)" }} />
    </svg>
  );
}

export const Waiting = (p: IconProps) => (
  <Svg {...p} strokeWidth={1.8}>
    <circle cx="12" cy="12" r="9.2" />
    <path d="M12 7v5l3 2" />
  </Svg>
);

export const Refused = (p: IconProps) => (
  <Svg {...p} strokeWidth={1.8}>
    <circle cx="12" cy="12" r="9.2" />
    <path d="M9 9l6 6M15 9l-6 6" />
  </Svg>
);
