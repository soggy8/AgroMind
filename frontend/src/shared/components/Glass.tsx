import type { HTMLAttributes } from "react";

/** The one floating surface (DESIGN.md section 3). Glass sits on the map, never on glass. */
export function Glass({ className = "", as: Tag = "div", ...rest }: HTMLAttributes<HTMLElement> & { as?: "div" | "aside" | "header" | "section" }) {
  return <Tag className={`glass ${className}`} {...rest} />;
}
