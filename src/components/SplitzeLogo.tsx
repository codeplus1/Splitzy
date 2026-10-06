import React from 'react';

export interface SplitzeLogoProps {
  /**
   * 'mark': Square/rounded icon mark only
   * 'horizontal': Icon mark + Splitze wordmark side-by-side (great for Header)
   * 'full': Stacked icon mark + Splitze wordmark + optional tagline (great for Hero / Welcome / Onboarding / Lock screen)
   */
  variant?: 'mark' | 'horizontal' | 'full';
  size?: 'xs' | 'sm' | 'md' | 'lg' | 'xl';
  showTagline?: boolean;
  taglineText?: string;
  className?: string;
  markClassName?: string;
  textClassName?: string;
  /**
   * Force dark-background styling (white wordmark) when rendered inside a dark Navy header banner
   */
  onDark?: boolean;
}

const MARK_SIZES: Record<NonNullable<SplitzeLogoProps['size']>, string> = {
  xs: 'w-6 h-6 rounded-[7px]',
  sm: 'w-8 h-8 rounded-[10px]',
  md: 'w-10 h-10 rounded-xl',
  lg: 'w-12 h-12 rounded-[14px]',
  xl: 'w-16 h-16 rounded-2xl',
};

const WORDMARK_SIZES: Record<NonNullable<SplitzeLogoProps['size']>, string> = {
  xs: 'text-sm',
  sm: 'text-base',
  md: 'text-lg',
  lg: 'text-xl',
  xl: 'text-2xl sm:text-3xl',
};

/**
 * Reusable Splitze Brand Logo Component
 * Primary Navy (#101D2D) & Mint Green (#63E6BE) geometric split-S fintech emblem.
 */
export const SplitzeLogo: React.FC<SplitzeLogoProps> = ({
  variant = 'horizontal',
  size = 'sm',
  showTagline = false,
  taglineText = 'Split smart. Stay even.',
  className = '',
  markClassName = '',
  textClassName = '',
  onDark = false,
}) => {
  const markSizeClass = MARK_SIZES[size] || MARK_SIZES.sm;
  const wordmarkSizeClass = WORDMARK_SIZES[size] || WORDMARK_SIZES.sm;

  const MarkSvg = (
    <div
      className={`relative inline-flex items-center justify-center bg-[#101D2D] border border-[#63E6BE]/30 shadow-2xs shrink-0 overflow-hidden select-none ${markSizeClass} ${markClassName}`}
      aria-hidden="true"
    >
      <svg
        viewBox="0 0 64 64"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        className="w-full h-full"
      >
        <defs>
          <linearGradient id="splitzeNavyGrad" x1="0" y1="0" x2="64" y2="64" gradientUnits="userSpaceOnUse">
            <stop offset="0%" stopColor="#16273B" />
            <stop offset="100%" stopColor="#0B1420" />
          </linearGradient>
          <radialGradient id="splitzeMintGlow" cx="78%" cy="22%" r="60%">
            <stop offset="0%" stopColor="#63E6BE" stopOpacity="0.24" />
            <stop offset="100%" stopColor="#63E6BE" stopOpacity="0" />
          </radialGradient>
        </defs>

        <rect width="64" height="64" fill="url(#splitzeNavyGrad)" />
        <rect width="64" height="64" fill="url(#splitzeMintGlow)" />

        {/* Upper Split Ribbon — Mint Green (#63E6BE) */}
        <path
          d="M42 15H24.5C19.8056 15 16 18.8056 16 23.5C16 28.1944 19.8056 32 24.5 32H37.5"
          stroke="#63E6BE"
          strokeWidth="6.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        {/* Subtle Mint Arrowhead on Upper Split */}
        <path
          d="M37 10.5L43.5 15L37 19.5"
          stroke="#63E6BE"
          strokeWidth="4.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />

        {/* Lower Even Ribbon — Crisp White (#FFFFFF) */}
        <path
          d="M22 49H39.5C44.1944 49 48 45.1944 48 40.5C48 35.8056 44.1944 32 39.5 32H26.5"
          stroke="#FFFFFF"
          strokeWidth="6.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        {/* Subtle White Arrowhead on Lower Split */}
        <path
          d="M27 44.5L20.5 49L27 53.5"
          stroke="#FFFFFF"
          strokeWidth="4.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />

        {/* Center Equilibrium Node — Mint Green Dot */}
        <circle cx="32" cy="32" r="3" fill="#63E6BE" />
      </svg>
    </div>
  );

  if (variant === 'mark') {
    return MarkSvg;
  }

  if (variant === 'full') {
    return (
      <div className={`inline-flex flex-col items-center text-center ${className}`}>
        {MarkSvg}
        <div className={`mt-2.5 font-display font-bold tracking-tight leading-none ${wordmarkSizeClass} ${onDark ? 'text-white' : 'text-[var(--ink)]'} ${textClassName}`}>
          <span>Split</span>
          <span className="text-[#12B886] dark:text-[#63E6BE]">ze</span>
        </div>
        {showTagline && (
          <p className={`mt-1 text-xs font-medium tracking-tight ${onDark ? 'text-[#8B9AAF]' : 'text-[var(--ink-secondary)]'}`}>
            {taglineText}
          </p>
        )}
      </div>
    );
  }

  return (
    <div className={`inline-flex items-center gap-2.5 ${className}`}>
      {MarkSvg}
      <div className="flex flex-col justify-center text-left">
        <span
          className={`font-display font-bold tracking-tight leading-none ${wordmarkSizeClass} ${
            onDark ? 'text-white' : 'text-[var(--ink)]'
          } ${textClassName}`}
        >
          <span>Split</span>
          <span className={onDark ? 'text-[#63E6BE]' : 'text-[#0CA678] dark:text-[#63E6BE]'}>ze</span>
        </span>
        {showTagline && (
          <span
            className={`text-[10px] font-medium tracking-tight leading-tight mt-0.5 ${
              onDark ? 'text-[#8B9AAF]' : 'text-[var(--ink-secondary)]'
            }`}
          >
            {taglineText}
          </span>
        )}
      </div>
    </div>
  );
};
