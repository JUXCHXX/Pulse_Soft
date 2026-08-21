import { getInitials, getAvatarColor } from '@/lib/format';

interface AvatarProps {
  name: string;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}

export function Avatar({ name, size = 'md', className = '' }: AvatarProps) {
  const sizes = {
    sm: 'w-7 h-7 text-xs',
    md: 'w-9 h-9 text-sm',
    lg: 'w-12 h-12 text-base',
  };
  return (
    <div
      className={`${sizes[size]} ${getAvatarColor(name)} rounded-full flex items-center justify-center font-semibold text-white shrink-0 ${className}`}
      title={name}
    >
      {getInitials(name)}
    </div>
  );
}

interface AvatarStackProps {
  names: string[];
  max?: number;
  size?: 'sm' | 'md';
}

export function AvatarStack({ names, max = 3, size = 'sm' }: AvatarStackProps) {
  const display = names.slice(0, max);
  const remaining = names.length - max;
  return (
    <div className="flex items-center -space-x-2">
      {display.map((name, i) => (
        <Avatar key={i} name={name} size={size} className="ring-2 ring-[var(--bg-card)]" />
      ))}
      {remaining > 0 && (
        <div className="w-7 h-7 rounded-full bg-[var(--bg-hover)] flex items-center justify-center text-xs font-semibold text-[var(--text-on-dark)] ring-2 ring-[var(--bg-card)]">
          +{remaining}
        </div>
      )}
    </div>
  );
}
