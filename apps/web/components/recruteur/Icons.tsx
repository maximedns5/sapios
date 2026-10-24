// Icônes SVG en ligne de l'espace recruteur (traits 2 px, 24 × 24), reprises des maquettes.

type P = { size?: number; className?: string };

function Svg({ size = 20, className, children, fill = "none" }: P & { children: React.ReactNode; fill?: string }) {
  return (
    <svg
      aria-hidden="true"
      className={className}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill={fill}
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {children}
    </svg>
  );
}

export const IconOffers = (p: P) => (
  <Svg {...p}>
    <rect x="3" y="7" width="18" height="13" rx="3" />
    <path d="M9 7V5h6v2" />
  </Svg>
);
export const IconList = (p: P) => (
  <Svg {...p}>
    <path d="M8 6h12M8 12h12M8 18h12" />
    <path d="M3.5 6l1 1 2-2M3.5 12l1 1 2-2M3.5 18l1 1 2-2" />
  </Svg>
);
export const IconSearch = (p: P) => (
  <Svg {...p}>
    <circle cx="11" cy="11" r="7" />
    <path d="M20 20l-4-4" />
  </Svg>
);
export const IconChat = (p: P) => (
  <Svg {...p}>
    <path d="M4 5h16v11H9l-5 4z" />
  </Svg>
);
export const IconBuilding = (p: P) => (
  <Svg {...p}>
    <rect x="4" y="3" width="16" height="18" rx="2" />
    <path d="M9 7h2M13 7h2M9 11h2M13 11h2M10 21v-4h4v4" />
  </Svg>
);
export const IconTeam = (p: P) => (
  <Svg {...p}>
    <circle cx="9" cy="8" r="3.5" />
    <path d="M2.5 20c1-3.5 3.6-5 6.5-5s5.5 1.5 6.5 5" />
    <path d="M16 4.5a3.5 3.5 0 0 1 0 7M18 15c2 .6 3.2 2.2 3.5 5" />
  </Svg>
);
export const IconCard = (p: P) => (
  <Svg {...p}>
    <rect x="3" y="5" width="18" height="14" rx="3" />
    <path d="M3 10h18" />
  </Svg>
);
export const IconCheck = (p: P) => (
  <Svg {...p}>
    <path d="M6 12.5l4 4 8-9" />
  </Svg>
);
export const IconCheckCircle = (p: P) => (
  <Svg {...p} fill="currentColor">
    <circle cx="12" cy="12" r="10" stroke="none" />
    <path d="M7.5 12.5l3 3 6-6.5" stroke="#fff" strokeWidth="2.6" />
  </Svg>
);
export const IconX = (p: P) => (
  <Svg {...p}>
    <path d="M6 6l12 12M18 6L6 18" />
  </Svg>
);
export const IconLock = (p: P) => (
  <Svg {...p}>
    <rect x="5" y="11" width="14" height="10" rx="2" />
    <path d="M8 11V8a4 4 0 0 1 8 0v3" />
  </Svg>
);
export const IconUnlock = (p: P) => (
  <Svg {...p}>
    <rect x="5" y="11" width="14" height="10" rx="2" />
    <path d="M8 11V8a4 4 0 0 1 7.5-2" />
  </Svg>
);
export const IconClock = (p: P) => (
  <Svg {...p}>
    <circle cx="12" cy="13" r="8" />
    <path d="M12 9v4l2.5 2M9 2h6" />
  </Svg>
);
export const IconPlus = (p: P) => (
  <Svg {...p}>
    <path d="M12 5v14M5 12h14" />
  </Svg>
);
export const IconArrowLeft = (p: P) => (
  <Svg {...p}>
    <path d="M15 5l-7 7 7 7" />
  </Svg>
);
export const IconArrowRight = (p: P) => (
  <Svg {...p}>
    <path d="M9 5l7 7-7 7" />
  </Svg>
);
export const IconHeart = (p: P) => (
  <Svg {...p} fill="currentColor">
    <path d="M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.6-7 10-7 10z" stroke="none" />
  </Svg>
);
export const IconCap = (p: P) => (
  <Svg {...p}>
    <path d="M2 9l10-5 10 5-10 5z" />
    <path d="M6 11v5c3 2 9 2 12 0v-5" />
  </Svg>
);
export const IconGlobe = (p: P) => (
  <Svg {...p}>
    <circle cx="12" cy="12" r="9" />
    <path d="M3 12h18M12 3c2.5 2.6 3.8 5.6 3.8 9s-1.3 6.4-3.8 9c-2.5-2.6-3.8-5.6-3.8-9S9.5 5.6 12 3z" />
  </Svg>
);
export const IconAlert = (p: P) => (
  <Svg {...p}>
    <circle cx="12" cy="12" r="9" />
    <path d="M12 7.5v5.5M12 16.5v.5" />
  </Svg>
);
export const IconPhoto = (p: P) => (
  <Svg {...p}>
    <rect x="3" y="5" width="18" height="14" rx="3" />
    <circle cx="9" cy="10" r="2" />
    <path d="M21 16l-5-5-8 8" />
  </Svg>
);
export const IconCalendar = (p: P) => (
  <Svg {...p}>
    <rect x="4" y="5" width="16" height="15" rx="3" />
    <path d="M4 10h16M9 3v4M15 3v4" />
  </Svg>
);
export const IconSend = (p: P) => (
  <Svg {...p}>
    <path d="M4 12l16-8-6 16-3-7z" />
  </Svg>
);
export const IconMore = (p: P) => (
  <Svg {...p}>
    <circle cx="5" cy="12" r="1.2" />
    <circle cx="12" cy="12" r="1.2" />
    <circle cx="19" cy="12" r="1.2" />
  </Svg>
);
export const IconStack = (p: P) => (
  <Svg {...p}>
    <rect x="6" y="3" width="12" height="17" rx="2.5" />
    <path d="M3 7v11M21 7v11" />
  </Svg>
);
