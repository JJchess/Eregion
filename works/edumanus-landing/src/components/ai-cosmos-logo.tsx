import React, { useId } from 'react';

/** Compact orbit mark for AI Cosmos — matches brand purple gradient. */
export function AiCosmosLogo({ size = 28, className }: { size?: number; className?: string }) {
  const gid = useId().replace(/:/g, '');
  const gradId = `ai-cosmos-grad-${gid}`;
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 32 32"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      aria-hidden
    >
      <defs>
        <linearGradient id={gradId} x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#C4A1D8" />
          <stop offset="55%" stopColor="#9B7AB8" />
          <stop offset="100%" stopColor="#6B4F8C" />
        </linearGradient>
      </defs>
      <circle cx="16" cy="16" r="13.5" stroke={`url(#${gradId})`} strokeWidth="1.25" opacity={0.85} />
      <ellipse
        cx="16"
        cy="16"
        rx="10"
        ry="4.5"
        stroke={`url(#${gradId})`}
        strokeWidth="1"
        opacity={0.75}
        transform="rotate(-28 16 16)"
      />
      <ellipse
        cx="16"
        cy="16"
        rx="6"
        ry="10"
        stroke={`url(#${gradId})`}
        strokeWidth="0.85"
        opacity={0.45}
        transform="rotate(62 16 16)"
      />
      <circle cx="16" cy="9" r="2.25" fill={`url(#${gradId})`} />
      <circle cx="23" cy="20" r="1.35" fill={`url(#${gradId})`} opacity={0.9} />
    </svg>
  );
}
