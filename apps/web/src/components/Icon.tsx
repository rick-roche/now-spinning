import type { HTMLAttributes } from "react";

interface IconProps extends HTMLAttributes<HTMLSpanElement> {
  name: string;
  filled?: boolean;
  className?: string;
}

export function Icon({ name, filled, className = "", ...props }: IconProps) {
  return (
    <span
      {...props}
      className={`material-symbols-outlined ${filled ? "fill-1" : ""} ${className}`}
    >
      {name}
    </span>
  );
}
