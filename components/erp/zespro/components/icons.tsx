"use client";

import type { SVGProps } from "react";

type IconProps = SVGProps<SVGSVGElement> & { size?: number };

function IconBase({ size = 16, children, ...props }: IconProps) {
  return (
    <svg
      aria-hidden="true"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      {...props}
    >
      {children}
    </svg>
  );
}

export function CloseIcon(props: IconProps) {
  return <IconBase {...props}><path d="M6 6l12 12M18 6 6 18" /></IconBase>;
}

export function ArrowLeftIcon(props: IconProps) {
  return <IconBase {...props}><path d="m15 18-6-6 6-6" /></IconBase>;
}

export function SearchIcon(props: IconProps) {
  return <IconBase {...props}><circle cx="11" cy="11" r="7" /><path d="m20 20-4-4" /></IconBase>;
}

export function ImageIcon(props: IconProps) {
  return <IconBase {...props}><rect x="3" y="4" width="18" height="16" rx="2" /><circle cx="8.5" cy="9" r="1.5" /><path d="m21 15-5-5L5 20" /></IconBase>;
}

export function ExternalLinkIcon(props: IconProps) {
  return <IconBase {...props}><path d="M14 4h6v6M20 4l-9 9" /><path d="M19 13v6a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1h6" /></IconBase>;
}

export function ChevronDoubleIcon({ direction = "left", ...props }: IconProps & { direction?: "left" | "right" }) {
  return (
    <IconBase {...props} style={{ transform: direction === "right" ? "rotate(180deg)" : undefined, ...props.style }}>
      <path d="m13 18-6-6 6-6M19 18l-6-6 6-6" />
    </IconBase>
  );
}

export function StarIcon({ filled = false, ...props }: IconProps & { filled?: boolean }) {
  return (
    <IconBase {...props} fill={filled ? "currentColor" : "none"}>
      <path d="m12 3 2.8 5.7 6.2.9-4.5 4.4 1.1 6.2-5.6-3-5.6 3 1.1-6.2L3 9.6l6.2-.9L12 3Z" />
    </IconBase>
  );
}

export function FilterIcon(props: IconProps) {
  return <IconBase {...props}><path d="M4 5h16l-6.4 7.4v5.4l-3.2 2v-7.4L4 5Z" /></IconBase>;
}

export function ChevronIcon({ direction = "right", ...props }: IconProps & { direction?: "right" | "down" }) {
  return (
    <IconBase {...props} style={{ transform: direction === "down" ? "rotate(90deg)" : undefined, ...props.style }}>
      <path d="m9 18 6-6-6-6" />
    </IconBase>
  );
}

export function MoreIcon({ orientation = "vertical", ...props }: IconProps & { orientation?: "vertical" | "horizontal" }) {
  return (
    <IconBase
      {...props}
      fill="currentColor"
      stroke="none"
      style={{ transform: orientation === "horizontal" ? "rotate(90deg)" : undefined, ...props.style }}
    >
      <circle cx="12" cy="5" r="1.7" />
      <circle cx="12" cy="12" r="1.7" />
      <circle cx="12" cy="19" r="1.7" />
    </IconBase>
  );
}
