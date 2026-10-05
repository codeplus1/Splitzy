import React from 'react';

export interface MemberAvatarProps {
  name: string;
  avatar?: string;
  color?: string;
  size?: 'xs' | 'sm' | 'md' | 'lg' | 'xl';
  className?: string;
}

const SIZE_MAP = {
  xs: 'w-5 h-5 text-[10px]',
  sm: 'w-7 h-7 text-xs',
  md: 'w-9 h-9 text-sm',
  lg: 'w-11 h-11 text-base',
  xl: 'w-14 h-14 text-xl',
};

const DEFAULT_COLORS = [
  '#059669', // Emerald
  '#2563eb', // Blue
  '#d97706', // Amber
  '#7c3aed', // Purple
  '#dc2626', // Red
  '#0891b2', // Cyan
  '#db2777', // Pink
  '#4b5563', // Gray
];

function getFallbackColor(name: string): string {
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  }
  return DEFAULT_COLORS[Math.abs(hash) % DEFAULT_COLORS.length];
}

export const MemberAvatar: React.FC<MemberAvatarProps> = ({
  name,
  avatar,
  color,
  size = 'md',
  className = '',
}) => {
  const sizeClasses = SIZE_MAP[size] || SIZE_MAP.md;
  const isImage = Boolean(
    avatar &&
      (avatar.startsWith('data:image/') ||
        avatar.startsWith('http://') ||
        avatar.startsWith('https://'))
  );
  const isEmoji = Boolean(!isImage && avatar && /\p{Extended_Pictographic}/u.test(avatar));
  const bgColor = color || getFallbackColor(name || 'User');
  const initial = (name || '?').trim().charAt(0).toUpperCase();

  return (
    <div
      className={`inline-flex items-center justify-center rounded-full font-bold select-none shrink-0 shadow-2xs overflow-hidden transition-transform ${sizeClasses} ${className}`}
      style={{
        backgroundColor: isImage ? 'transparent' : isEmoji ? `${bgColor}20` : bgColor,
        color: isEmoji ? 'inherit' : '#FFFFFF',
      }}
      title={name}
      aria-label={name}
    >
      {isImage ? (
        <img
          src={avatar}
          alt={name}
          className="w-full h-full object-cover rounded-full"
          loading="lazy"
        />
      ) : avatar ? (
        <span className="leading-none">{avatar}</span>
      ) : (
        <span className="leading-none text-white">{initial}</span>
      )}
    </div>
  );
};
