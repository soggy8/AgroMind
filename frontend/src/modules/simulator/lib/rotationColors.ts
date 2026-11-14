/** Each rotation keeps one colour across every chart (DESIGN.md section 7). Max four rotations. */
export const ROTATION_COLORS = ["var(--color-lime)", "var(--color-rain)", "var(--color-water)", "var(--color-soil)"] as const;

export const rotationColor = (inputIndex: number) => ROTATION_COLORS[inputIndex % ROTATION_COLORS.length];
