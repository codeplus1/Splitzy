import React, { useId } from 'react';

export type SplitzeLogoSize = number | 'xs' | 'sm' | 'md' | 'lg' | 'xl';

const LOGO_SIZE_MAP: Record<'xs' | 'sm' | 'md' | 'lg' | 'xl', number> = {
  xs: 24,
  sm: 30,
  md: 36,
  lg: 48,
  xl: 60,
};

export interface SplitzeLogoProps {
  /**
   * 'mark': Circular icon mark only
   * 'horizontal': Circular icon mark + Splitze wordmark side-by-side (great for Header)
   * 'full': Stacked circular icon mark + Splitze wordmark + optional tagline (great for Hero / Onboarding)
   */
  variant?: 'mark' | 'horizontal' | 'full';
  /**
   * Size of the icon mark in pixels or preset ('xs' | 'sm' | 'md' | 'lg' | 'xl', default: 36)
   */
  size?: SplitzeLogoSize;
  /**
   * Show the tagline "Split smart. Stay even." (default: false for horizontal, true for full)
   */
  showTagline?: boolean;
  /**
   * Custom tagline override
   */
  tagline?: string;
  /**
   * Optional className for outer wrapper
   */
  className?: string;
  /**
   * Optional className for the circular icon mark wrapper
   */
  markClassName?: string;
  /**
   * Force light or dark text color on wordmark, or 'auto' to follow theme
   */
  theme?: 'light' | 'dark' | 'auto';
}

/**
 * Reusable Splitze Brand Logo Component
 * Matches the circular Splitze app icon:
 * - Upper-left teal/cyan half (#00A8C6 -> #0097B2)
 * - Lower-right deep navy half (#0F2547)
 * - Dynamic white sweeping curve transitioning into a crisp checkmark ribbon with subtle silver depth
 */
export const SplitzeLogo: React.FC<SplitzeLogoProps> = ({
  variant = 'horizontal',
  size = 36,
  showTagline,
  tagline = 'Split smart. Stay even.',
  className = '',
  markClassName = '',
  theme = 'auto',
}) => {
  const uid = useId().replace(/:/g, '');
  const numericSize =
    typeof size === 'number' && Number.isFinite(size) && size > 0
      ? size
      : typeof size === 'string' && size in LOGO_SIZE_MAP
      ? LOGO_SIZE_MAP[size as keyof typeof LOGO_SIZE_MAP]
      : 36;
  const displayTagline = showTagline ?? variant === 'full';

  const wordmarkColorClass =
    theme === 'dark'
      ? 'text-white'
      : theme === 'light'
      ? 'text-[#101D2D]'
      : 'text-[#101D2D] dark:text-white';

  const taglineColorClass =
    theme === 'dark'
      ? 'text-[#8B9AAF]'
      : theme === 'light'
      ? 'text-[#8B9AAF]'
      : 'text-[#8B9AAF]';

  const fullWordmarkSizeClass =
    numericSize >= 56
      ? 'text-3xl'
      : numericSize >= 44
      ? 'text-2xl'
      : 'text-xl';

  const horizontalWordmarkSizeClass =
    numericSize >= 48
      ? 'text-2xl'
      : numericSize >= 36
      ? 'text-xl'
      : numericSize >= 28
      ? 'text-lg'
      : 'text-base';

  const IconMark = (
    <svg
      width={numericSize}
      height={numericSize}
      viewBox="0 0 512 512"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={`shrink-0 select-none rounded-full ${markClassName}`}
      aria-hidden="true"
    >
      <defs>
        <clipPath id={`circleClip_${uid}`}>
          <circle cx="256" cy="256" r="240" />
        </clipPath>
        <linearGradient id={`tealGrad_${uid}`} x1="60" y1="40" x2="360" y2="280" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#05B2DC" />
          <stop offset="100%" stopColor="#0093B5" />
        </linearGradient>
        <linearGradient id={`navyGrad_${uid}`} x1="160" y1="220" x2="450" y2="480" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#132D54" />
          <stop offset="100%" stopColor="#0B1D3A" />
        </linearGradient>
        <linearGradient id={`checkFoldGrad_${uid}`} x1="276" y1="215" x2="355" y2="295" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#CFD6DF" />
          <stop offset="65%" stopColor="#F1F4F8" />
          <stop offset="100%" stopColor="#FFFFFF" />
        </linearGradient>
      </defs>

      <g clipPath={`url(#circleClip_${uid})`}>
        {/* Base Deep Navy Circle */}
        <rect x="0" y="0" width="512" height="512" fill={`url(#navyGrad_${uid})`} />

        {/* Upper-Left Teal Region bounded by the curve and checkmark valley */}
        <path
          d="M 0 0 L 512 0 L 512 135 L 341 245 L 284 167 Q 158 192 27 320 L 0 348 Z"
          fill={`url(#tealGrad_${uid})`}
        />

        {/* White Sweeping Left Curve Ribbon */}
        <path
          d="M 15 358 Q 148 214 307 199 L 284 167 Q 138 186 0 330 Z"
          fill="#FFFFFF"
        />

        {/* Checkmark Ribbon with Subtle Silver 3D Fold on the Left Arm */}
        <path
          d="M 276 216 L 339 302 L 495 190 L 474 159 L 341 245 L 308 202 Z"
          fill={`url(#checkFoldGrad_${uid})`}
        />

        {/* Crisp White Right Ascender of the Checkmark */}
        <path
          d="M 339 302 L 495 190 L 474 159 L 341 245 Z"
          fill="#FFFFFF"
        />
      </g>
    </svg>
  );

  if (variant === 'mark') {
    return <div className={`inline-flex items-center justify-center ${className}`}>{IconMark}</div>;
  }

  if (variant === 'full') {
    return (
      <div className={`inline-flex flex-col items-center text-center ${className}`}>
        <div className="mb-2.5 drop-shadow-md">{IconMark}</div>
        <div
          className={`font-display font-extrabold tracking-tight leading-none ${fullWordmarkSizeClass} ${wordmarkColorClass}`}
        >
          Split<span className="text-[#05B2DC]">ze</span>
        </div>
        {displayTagline && (
          <p className={`mt-1.5 text-xs sm:text-sm font-medium tracking-normal ${taglineColorClass}`}>
            {tagline}
          </p>
        )}
      </div>
    );
  }

  // Default: 'horizontal'
  return (
    <div className={`inline-flex items-center gap-2.5 ${className}`}>
      {IconMark}
      <div className="flex flex-col justify-center">
        <span
          className={`font-display font-extrabold tracking-tight leading-none ${horizontalWordmarkSizeClass} ${wordmarkColorClass}`}
        >
          Split<span className="text-[#05B2DC] dark:text-[#63E6BE]">ze</span>
        </span>
        {displayTagline && (
          <span className={`text-[10px] font-semibold leading-tight mt-0.5 ${taglineColorClass}`}>
            {tagline}
          </span>
        )}
      </div>
    </div>
  );
};
