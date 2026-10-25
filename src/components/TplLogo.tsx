import React from 'react';

interface TplLogoProps {
  variant?: 'white' | 'dark'; // 'white' = white text/mark for green background, 'dark' = green text/mark for white background
  className?: string;
  size?: 'sm' | 'md' | 'lg';
  customSrc?: string; // Optional custom uploaded logo data URL / image
}

export const TplLogo: React.FC<TplLogoProps> = ({
  variant = 'white',
  className = '',
  size = 'md',
  customSrc,
}) => {
  const isWhite = variant === 'white';

  const heights = {
    sm: 'h-8',
    md: 'h-11',
    lg: 'h-14',
  };

  // If a custom logo image was uploaded, render it directly
  if (customSrc) {
    return (
      <div className={`flex items-center gap-2 select-none ${className}`}>
        <img
          src={customSrc}
          alt="TPL Logo"
          className={`${heights[size]} w-auto object-contain max-w-[200px]`}
        />
      </div>
    );
  }

  const primaryColor = isWhite ? '#ffffff' : '#04342c';
  const subtextColor = isWhite ? '#a7f3d0' : '#065f46';

  return (
    <div className={`flex items-center gap-2.5 select-none ${className}`}>
      {/* Placeholder: [Company Logo] */}
      <div
        className={`${heights[size]} px-2.5 rounded-md flex items-center justify-center font-mono font-bold text-[10px] tracking-wider uppercase border border-dashed transition-all`}
        style={{
          backgroundColor: isWhite ? 'rgba(255,255,255,0.12)' : 'rgba(4,52,44,0.06)',
          borderColor: isWhite ? 'rgba(255,255,255,0.35)' : 'rgba(4,52,44,0.3)',
          color: primaryColor,
        }}
        title="Custom logo can be uploaded in Admin Menu"
      >
        [Company Logo]
      </div>

      {/* Placeholder: [Company Name] */}
      <div className="flex flex-col justify-center leading-tight">
        <span
          className="font-black text-sm md:text-base tracking-wide font-sans uppercase"
          style={{ color: primaryColor }}
        >
          [Company Name]
        </span>
        <span
          className="text-[9px] font-semibold tracking-wider uppercase opacity-80"
          style={{ color: subtextColor }}
        >
          Production Flow Tracker
        </span>
      </div>
    </div>
  );
};
