import React from 'react';

interface WaslaLogoProps {
  size?: number;
  className?: string;
  showText?: boolean;
  textSize?: 'sm' | 'md' | 'lg' | 'xl';
}

const logoUrl = '/src-tauri/icons/logo.png';

export const WaslaLogo: React.FC<WaslaLogoProps> = ({ 
  size = 48, 
  className = '', 
  showText = false,
  textSize = 'md'
}) => {
  const textSizeClasses = {
    sm: 'text-sm',
    md: 'text-lg',
    lg: 'text-xl',
    xl: 'text-2xl'
  };

  if (showText) {
    return (
      <div className={`flex items-center gap-3 ${className}`}>
        <img
          src={logoUrl}
          alt="Wasla Logo"
          width={size}
          height={size}
          className="object-contain"
          onError={(e) => {
            // Fallback to text if image fails to load
            const target = e.target as HTMLImageElement;
            target.style.display = 'none';
            const fallback = target.nextSibling as HTMLDivElement;
            if (fallback) fallback.style.display = 'flex';
          }}
        />
        <div 
          className={`w-${size/4} h-${size/4} bg-primary rounded-lg items-center justify-center text-white font-bold hidden`}
          style={{ width: size, height: size }}
        >
          W
        </div>
        <span className={`font-bold text-primary ${textSizeClasses[textSize]}`}>
          Wasla
        </span>
      </div>
    );
  }

  return (
    <div className={`inline-flex ${className}`}>
      <img
        src={logoUrl}
        alt="Wasla Logo"
        width={size}
        height={size}
        className="object-contain"
        onError={(e) => {
          // Fallback to colored W if image fails to load
          const target = e.target as HTMLImageElement;
          target.style.display = 'none';
          const fallback = target.nextSibling as HTMLDivElement;
          if (fallback) fallback.style.display = 'flex';
        }}
      />
      <div 
        className={`bg-primary rounded-lg items-center justify-center text-white font-bold hidden`}
        style={{ width: size, height: size }}
      >
        W
      </div>
    </div>
  );
};

export default WaslaLogo;