import type { ButtonHTMLAttributes } from "react";

type Variant = "primary" | "secondary" | "ghost";

const styles: Record<Variant, string> = {
  primary: "btn-primary px-4 py-2.5 text-sm hover:brightness-105 active:brightness-95 disabled:opacity-60",
  secondary:
    "bg-glass-hi border border-line text-tx rounded-ctl px-3.5 py-2 text-sm font-semibold hover:bg-glass-sel disabled:opacity-50",
  ghost: "text-mut rounded-ctl px-2.5 py-1.5 text-sm font-semibold hover:text-tx hover:bg-glass-hi disabled:opacity-50",
};

/** One primary button per screen (DESIGN.md section 6). */
export function Button({ variant = "secondary", className = "", ...rest }: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant }) {
  return (
    <button
      type="button"
      className={`inline-flex items-center justify-center gap-2 transition-colors disabled:cursor-not-allowed ${styles[variant]} ${className}`}
      {...rest}
    />
  );
}
