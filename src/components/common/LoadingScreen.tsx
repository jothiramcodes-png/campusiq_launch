import React, { useState, useEffect, useCallback } from 'react';

interface LoadingScreenProps {
  onComplete?: () => void;
  minDurationMs?: number;
}

export const LoadingScreen: React.FC<LoadingScreenProps> = ({
  onComplete,
  minDurationMs = 2200,
}) => {
  const [progress, setProgress] = useState(0);
  const [isFadingOut, setIsFadingOut] = useState(false);

  const handleFinish = useCallback(() => {
    setIsFadingOut(true);
    const timeout = setTimeout(() => {
      if (onComplete) onComplete();
    }, 400);
    return () => clearTimeout(timeout);
  }, [onComplete]);

  // Keyboard shortcut listener (Space, Enter, Escape to skip)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.code === 'Space' || e.code === 'Enter' || e.key === 'Escape') {
        e.preventDefault();
        handleFinish();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleFinish]);

  // Smooth progress ticker
  useEffect(() => {
    const startTime = Date.now();
    const interval = setInterval(() => {
      const elapsed = Date.now() - startTime;
      const pct = Math.min(100, Math.floor((elapsed / minDurationMs) * 100));
      setProgress(pct);

      if (pct >= 100) {
        clearInterval(interval);
        setTimeout(() => {
          handleFinish();
        }, 250);
      }
    }, 30);

    return () => clearInterval(interval);
  }, [minDurationMs, handleFinish]);

  // SVG Circular Gauge calculation
  const circleRadius = 92;
  const circumference = 2 * Math.PI * circleRadius;
  const strokeOffset = circumference - (progress / 100) * circumference;

  return (
    <div
      role="dialog"
      aria-label="CampusIQ Loading"
      onClick={handleFinish}
      className={`fixed inset-0 z-50 flex flex-col items-center justify-center select-none cursor-pointer transition-all duration-500 ease-out ${
        isFadingOut ? 'opacity-0 scale-105 pointer-events-none' : 'opacity-100 scale-100'
      }`}
      style={{
        background: 'radial-gradient(circle at center, #173B2F 0%, #101815 70%, #080D0B 100%)',
      }}
      title="Click or press Space to skip"
    >
      {/* Ambient background glows matching the main website's Emerald and Gold design system */}
      <div className="absolute inset-0 pointer-events-none overflow-hidden">
        <div className="absolute top-1/4 left-1/3 w-96 h-96 rounded-full bg-[#6E7F45]/20 blur-3xl" />
        <div className="absolute bottom-1/4 right-1/3 w-96 h-96 rounded-full bg-[#C49A55]/20 blur-3xl" />
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[520px] h-[520px] rounded-full bg-[#173B2F]/40 blur-[140px]" />
      </div>

      {/* Main Center Content */}
      <div className="relative z-10 flex flex-col items-center justify-center text-center px-6">
        
        {/* Animated Logo Container */}
        <div className="relative mb-7 flex items-center justify-center">
          
          {/* Outer rotating dashed ring in Academic Gold */}
          <div className="absolute w-[214px] h-[214px] rounded-full border border-dashed border-[#C49A55]/35 animate-spin-slow" />

          {/* Reverse rotating orbital accent dots in Sky Cyan & Gold */}
          <div className="absolute w-[240px] h-[240px] rounded-full border border-[#6FA9C9]/20 animate-spin-reverse">
            <div className="absolute -top-1 left-1/2 -translate-x-1/2 w-2 h-2 rounded-full bg-[#6FA9C9] shadow-[0_0_8px_#6FA9C9]" />
            <div className="absolute -bottom-1 left-1/2 -translate-x-1/2 w-2 h-2 rounded-full bg-[#C49A55] shadow-[0_0_8px_#C49A55]" />
          </div>

          {/* Subtle pulse aura */}
          <div className="absolute w-44 h-44 rounded-full bg-[#6E7F45]/25 blur-xl animate-pulse" />

          {/* Dynamic SVG Circular Progress Ring */}
          <div className="relative w-[196px] h-[196px] flex items-center justify-center">
            <svg
              className="absolute inset-0 w-full h-full -rotate-90 pointer-events-none drop-shadow-[0_0_14px_rgba(196,154,85,0.4)]"
              viewBox="0 0 200 200"
            >
              <defs>
                <linearGradient id="campusThemeGrad" x1="0%" y1="0%" x2="100%" y2="100%">
                  <stop offset="0%" stopColor="#285443" />
                  <stop offset="35%" stopColor="#6E7F45" />
                  <stop offset="70%" stopColor="#C49A55" />
                  <stop offset="100%" stopColor="#6FA9C9" />
                </linearGradient>
              </defs>

              {/* Background Track */}
              <circle
                cx="100"
                cy="100"
                r={circleRadius}
                fill="none"
                stroke="rgba(255, 255, 255, 0.08)"
                strokeWidth="3.5"
              />

              {/* Animated Progress Stroke */}
              <circle
                cx="100"
                cy="100"
                r={circleRadius}
                fill="none"
                stroke="url(#campusThemeGrad)"
                strokeWidth="4"
                strokeLinecap="round"
                strokeDasharray={circumference}
                strokeDashoffset={strokeOffset}
                className="transition-[stroke-dashoffset] duration-150 ease-out"
              />
            </svg>

            {/* Emblem Image with Institutional Emerald & Gold Glassmorphic Ring */}
            <div className="relative w-40 h-40 rounded-full overflow-hidden p-1 bg-gradient-to-tr from-[#173B2F] via-[#C49A55] to-[#6FA9C9] shadow-2xl shadow-emerald-950/90 border border-white/20">
              <img
                src="/assets/campusiq-fist-logo.jpg"
                alt="CampusIQ"
                className="w-full h-full object-cover rounded-full"
              />
              {/* Subtle glass reflection highlight */}
              <div className="absolute inset-0 bg-gradient-to-b from-white/15 via-transparent to-transparent pointer-events-none rounded-full" />
            </div>
          </div>
        </div>

        {/* Clean Brand Text Only — Styled identically to the Main Website */}
        <h1 className="text-4xl sm:text-5xl font-black tracking-tight text-white flex items-center justify-center drop-shadow-md">
          <span>CAMPUS</span>
          <span className="text-[#6FA9C9] ml-1.5">IQ</span>
        </h1>

        {/* Minimalist Slim Progress Bar in Brand Palette */}
        <div className="w-48 sm:w-56 mt-7 space-y-2">
          <div className="w-full bg-black/40 h-1.5 rounded-full overflow-hidden p-[1px] border border-white/10 shadow-inner">
            <div
              className="h-full rounded-full transition-all duration-150 ease-out bg-gradient-to-r from-[#285443] via-[#6E7F45] to-[#C49A55]"
              style={{ width: `${progress}%` }}
            />
          </div>
          
          <div className="flex justify-center text-[11px] font-mono text-[#C49A55] font-bold tracking-wider">
            <span>{progress}%</span>
          </div>
        </div>

      </div>
    </div>
  );
};

export default LoadingScreen;
