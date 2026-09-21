"use client";

import React from "react";
import { BrandWordmark, type WordmarkVariant } from "./BrandWordmark";

export { BrandWordmark };

export function ClearDraftLogo({
  size = 28,
  className = ""
}: {
  size?: number;
  className?: string;
}) {
  return (
    <img
      src="/logo.svg"
      alt="ClearDraft Emblem"
      width={size}
      height={size}
      className={className}
      style={{
        objectFit: "contain",
        display: "inline-block",
        flexShrink: 0
      }}
    />
  );
}

export function ClearDraftBrand({
  height = 36,
  size,
  showText = true,
  variant = "default",
  fontSize,
  className = ""
}: {
  height?: number;
  size?: number;
  showText?: boolean;
  variant?: WordmarkVariant;
  fontSize?: string | number;
  className?: string;
}) {
  // Proportional icon size matching enlarged refined lockup
  const iconSize = size || (height ? Math.round(height * 0.85) : 30);

  if (!showText) {
    return (
      <img
        src="/logo.svg"
        alt="ClearDraft"
        width={iconSize}
        height={iconSize}
        className={className}
        style={{
          objectFit: "contain",
          display: "block",
          flexShrink: 0
        }}
      />
    );
  }

  return (
    <div
      className={`cleardraft-brand-lockup ${className}`}
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: "9px",
        userSelect: "none",
        maxWidth: "100%",
        whiteSpace: "nowrap"
      }}
    >
      {/* Vector Logo Icon on Left */}
      <img
        src="/logo.svg"
        alt="ClearDraft Logo"
        width={iconSize}
        height={iconSize}
        style={{
          objectFit: "contain",
          display: "block",
          flexShrink: 0
        }}
      />

      {/* Typography Wordmark in Manrope on Right */}
      <BrandWordmark variant={variant} fontSize={fontSize} />
    </div>
  );
}

export default ClearDraftBrand;
