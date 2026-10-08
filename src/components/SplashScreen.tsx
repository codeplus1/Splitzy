import React, { useEffect, useState } from 'react';

interface SplashScreenProps {
  onFinish: () => void;
  durationMs?: number;
}

export const SplashScreen: React.FC<SplashScreenProps> = ({
  onFinish,
  durationMs = 2000,
}) => {
  const [isExiting, setIsExiting] = useState(false);
  const [imgError, setImgError] = useState(false);

  useEffect(() => {
    const exitTimer = setTimeout(() => {
      setIsExiting(true);
    }, Math.max(400, durationMs - 450));

    const finishTimer = setTimeout(() => {
      onFinish();
    }, durationMs);

    return () => {
      clearTimeout(exitTimer);
      clearTimeout(finishTimer);
    };
  }, [durationMs, onFinish]);

  return (
    <div
      id="splitze-splash-screen"
      role="status"
      aria-label="Loading Splitze"
      className={`fixed inset-0 z-[200] flex flex-col items-center justify-center bg-[#0B1420] text-white select-none overflow-hidden transition-all duration-500 ease-out ${
        isExiting ? 'opacity-0 scale-[1.03] pointer-events-none' : 'opacity-100 scale-100'
      }`}
    >
      {/* Subtle Ambient Glow Backdrop */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute w-80 h-80 rounded-full bg-[#63E6BE]/12 blur-3xl"
      />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute w-56 h-56 rounded-full bg-[#05B2DC]/10 blur-2xl -translate-y-8"
      />

      {/* Center Content Stack */}
      <div className="relative z-10 flex flex-col items-center text-center px-6">
        {/* Circular Avatar with Glowing Ring */}
        <div className="relative mb-6 flex items-center justify-center">
          {/* Outer pulsing ring */}
          <div
            aria-hidden="true"
            className="absolute -inset-2 rounded-full border border-[#63E6BE]/35 animate-pulse"
          />
          {/* Gradient ring wrapper */}
          <div className="w-28 h-28 sm:w-32 sm:h-32 rounded-full p-1 bg-gradient-to-tr from-[#63E6BE] via-[#05B2DC] to-[#152436] shadow-[0_0_32px_rgba(99,230,190,0.28)]">
            <div className="w-full h-full rounded-full overflow-hidden bg-[#101D2D] flex items-center justify-center border-2 border-[#0B1420]">
              {!imgError ? (
                <img
                  src="/profile.png"
                  alt="Splitze Profile Avatar"
                  referrerPolicy="no-referrer"
                  onError={() => setImgError(true)}
                  className="w-full h-full object-cover object-top"
                />
              ) : (
                <span className="text-3xl font-extrabold font-display text-[#63E6BE]">
                  S
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Brand Title (replacing Full Stack Developer text with Splitze) */}
        <h1 className="text-2xl sm:text-3xl font-extrabold font-display tracking-tight text-white">
          Split<span className="text-[#63E6BE]">ze</span>
        </h1>

        {/* Subtitle / Tagline */}
        <p className="mt-1.5 text-xs sm:text-sm font-medium tracking-[0.14em] uppercase text-[#8B9AAF]">
          Split smart. Stay even.
        </p>

        {/* Minimal Animated Progress Bar */}
        <div className="mt-7 w-36 h-1 rounded-full bg-[#152436] overflow-hidden border border-white/5">
          <div
            className="h-full rounded-full bg-gradient-to-r from-[#05B2DC] to-[#63E6BE] transition-all duration-1000 ease-out"
            style={{ width: isExiting ? '100%' : '82%' }}
          />
        </div>
      </div>
    </div>
  );
};
