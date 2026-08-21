interface BadgeProps {
  color: string;
  children: React.ReactNode;
  className?: string;
}

export function Badge({ color, children, className = '' }: BadgeProps) {
  return <span className={`badge ${color} ${className}`}>{children}</span>;
}

interface ProgressBarProps {
  value: number;
  max?: number;
  color?: string;
  className?: string;
}

export function ProgressBar({ value, max = 100, color, className = '' }: ProgressBarProps) {
  const pct = Math.min(100, Math.max(0, (value / max) * 100));
  return (
    <div className={`w-full h-2 bg-[var(--border)] rounded-full overflow-hidden ${className}`}>
      <div
        className="h-full rounded-full transition-all duration-500"
        style={{
          width: `${pct}%`,
          backgroundColor: color ?? 'var(--accent)',
        }}
      />
    </div>
  );
}
