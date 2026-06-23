import React from "react";

export default function Logo({ size = 18, className = "" }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" fill="none" className={className} aria-label="InfraLens">
      <path d="M16 4.5 L26 10.5 L26 21.5 L16 27.5 L6 21.5 L6 10.5 Z" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" opacity="0.85" />
      <path d="M16 16 L16 7.5 M16 16 L23 20 M16 16 L9 20" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" opacity="0.5" />
      <circle cx="16" cy="7.5" r="1.7" fill="currentColor" />
      <circle cx="23" cy="20" r="1.7" fill="currentColor" />
      <circle cx="9" cy="20" r="1.7" fill="currentColor" />
      <circle cx="16" cy="16" r="2.6" fill="currentColor" />
    </svg>
  );
}
