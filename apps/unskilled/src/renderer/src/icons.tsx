// Thin-stroke icons in the spirit of SF Symbols. 16px, currentColor.

type P = { size?: number };

const svg = (size: number, children: React.ReactNode) => (
  <svg width={size} height={size} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    {children}
  </svg>
);

export const IconCompose = ({ size = 16 }: P) =>
  svg(size, <><path d="M9.5 2.5H4A1.5 1.5 0 0 0 2.5 4v8A1.5 1.5 0 0 0 4 13.5h8a1.5 1.5 0 0 0 1.5-1.5V6.5" /><path d="M12.2 1.8a1.1 1.1 0 0 1 1.6 1.6L8 9.2l-2.2.6.6-2.2z" /></>);

export const IconFolder = ({ size = 16 }: P) =>
  svg(size, <path d="M2 4.5A1.5 1.5 0 0 1 3.5 3h2.6l1.4 1.5h5A1.5 1.5 0 0 1 14 6v5.5a1.5 1.5 0 0 1-1.5 1.5h-9A1.5 1.5 0 0 1 2 11.5z" />);

export const IconPlus = ({ size = 16 }: P) => svg(size, <><path d="M8 3v10" /><path d="M3 8h10" /></>);

export const IconArrowUp = ({ size = 16 }: P) =>
  svg(size, <><path d="M8 13V3.5" /><path d="M3.8 7.5 8 3.3l4.2 4.2" /></>);

export const IconStop = ({ size = 12 }: P) => (
  <svg width={size} height={size} viewBox="0 0 12 12" aria-hidden><rect x="2" y="2" width="8" height="8" rx="1.5" fill="currentColor" /></svg>
);

export const IconDiff = ({ size = 16 }: P) =>
  svg(size, <><rect x="2.5" y="2.5" width="11" height="11" rx="2" /><path d="M8 5v4M6 7h4M6 11h4" /></>);

export const IconChevron = ({ size = 12, open }: P & { open?: boolean }) => (
  <svg width={size} height={size} viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" style={{ transform: open ? "rotate(90deg)" : undefined, transition: "transform 150ms" }} aria-hidden>
    <path d="M4.5 2.5 8 6l-3.5 3.5" />
  </svg>
);

export const IconRefresh = ({ size = 16 }: P) =>
  svg(size, <><path d="M13 3v3.5H9.5" /><path d="M12.6 6.4A5 5 0 1 0 13 9" /></>);

export const IconSparkle = ({ size = 16 }: P) =>
  svg(size, <path d="M8 2.5 9.3 6.7 13.5 8l-4.2 1.3L8 13.5 6.7 9.3 2.5 8l4.2-1.3z" />);

export const IconArrowLeft = ({ size = 16 }: P) => svg(size, <><path d="M13 8H3.5" /><path d="M7.5 3.8 3.3 8l4.2 4.2" /></>);

export const IconArrowRight = ({ size = 16 }: P) => svg(size, <><path d="M3 8h9.5" /><path d="M8.5 3.8 12.7 8l-4.2 4.2" /></>);

export const IconGlobe = ({ size = 16 }: P) =>
  svg(size, <><circle cx="8" cy="8" r="5.5" /><path d="M2.5 8h11" /><path d="M8 2.5c1.6 1.6 2.3 3.4 2.3 5.5S9.6 11.9 8 13.5C6.4 11.9 5.7 10.1 5.7 8S6.4 4.1 8 2.5z" /></>);

export const IconTarget = ({ size = 16 }: P) =>
  svg(size, <><circle cx="8" cy="8" r="4.5" /><path d="M8 1.5v2.5M8 12v2.5M1.5 8H4M12 8h2.5" /></>);

export const IconTerminal = ({ size = 16 }: P) =>
  svg(size, <><rect x="2" y="3" width="12" height="10" rx="2" /><path d="m5 6.5 2 1.5-2 1.5M8.5 10h2.5" /></>);
