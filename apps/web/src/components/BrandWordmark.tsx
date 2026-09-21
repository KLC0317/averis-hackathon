"use client";

import React from "react";

export type WordmarkVariant = "compact" | "default" | "large" | "xl";

export interface BrandWordmarkProps {
  variant?: WordmarkVariant;
  fontSize?: string | number;
  className?: string;
  style?: React.CSSProperties;
  as?: "span" | "div" | "h1" | "h2";
}

const variantStyles: Record<
  WordmarkVariant,
  { fontSizeRem: string; fontSizePx: number }
> = {
  compact: { fontSizeRem: "1.125rem", fontSizePx: 18 },
  default: { fontSizeRem: "1.25rem", fontSizePx: 20 },
  large: { fontSizeRem: "1.625rem", fontSizePx: 26 },
  xl: { fontSizeRem: "2.25rem", fontSizePx: 36 }
};

/**
 * Reusable ClearDraft Brand Wordmark
 *
 * Typography System Specification:
 * - Font: Manrope (var(--font-wordmark))
 * - Variants: Compact (16px), Default (18px), Large (24px), XL (36px)
 * - Weight: 700 (Bold)
 * - Letter Spacing: -0.035em
 * - Line Height: 1.1
 * - Exact Capitalization: ClearDraft
 * - Color: Deep navy #142B45 on light backgrounds; accessible #F8FAFC on dark backgrounds
 * - Layout: Single-line guarantee (white-space: nowrap)
 */
export function BrandWordmark({
  variant = "default",
  fontSize,
  className = "",
  style,
  as: Component = "span"
}: BrandWordmarkProps) {
  const resolvedFontSize =
    fontSize ?? variantStyles[variant]?.fontSizeRem ?? variantStyles.default.fontSizeRem;

  return (
    <Component
      className={`brand-wordmark brand-wordmark-${variant} ${className}`}
      style={{
        fontFamily: "var(--font-wordmark), var(--font-sans), sans-serif",
        fontSize: resolvedFontSize,
        fontWeight: 700,
        letterSpacing: "-0.035em",
        lineHeight: 1.1,
        whiteSpace: "nowrap",
        display: "inline-flex",
        alignItems: "center",
        userSelect: "none",
        ...style
      }}
    >
      ClearDraft
    </Component>
  );
}

export default BrandWordmark;
