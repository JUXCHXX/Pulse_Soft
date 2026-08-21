export function formatCurrency(value: number | null | undefined): string {
  if (value == null) return '—';
  return new Intl.NumberFormat('es-MX', {
    style: 'currency',
    currency: 'MXN',
    minimumFractionDigits: 2,
  }).format(value);
}

export function formatNumber(value: number | null | undefined): string {
  if (value == null) return '0';
  return new Intl.NumberFormat('es-MX').format(value);
}

export function formatHours(value: number | null | undefined): string {
  if (value == null) return '0h';
  return `${value.toFixed(1)}h`;
}

export function formatDate(date: string | null | undefined): string {
  if (!date) return '—';
  return new Date(date + 'T00:00:00').toLocaleDateString('es-MX', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
}

export function formatDateTime(date: string | null | undefined): string {
  if (!date) return '—';
  return new Date(date).toLocaleDateString('es-MX', {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function formatRelativeTime(date: string | null | undefined): string {
  if (!date) return '—';
  const now = new Date();
  const past = new Date(date);
  const diffMs = now.getTime() - past.getTime();
  const diffMin = Math.floor(diffMs / 60000);
  const diffHrs = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMin < 1) return 'ahora';
  if (diffMin < 60) return `hace ${diffMin} min`;
  if (diffHrs < 24) return `hace ${diffHrs}h`;
  if (diffDays < 7) return `hace ${diffDays}d`;
  return formatDate(date);
}

export function formatDuration(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  return `${m}:${String(s).padStart(2, '0')}`;
}

export function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return name.slice(0, 2).toUpperCase();
}

export function getAvatarColor(seed: string): string {
  const colors = [
    'bg-caribbean-green',
    'bg-mountain-meadow',
    'bg-bangladesh-green',
    'bg-frog',
    'bg-mint',
    'bg-info',
    'bg-warning',
    'bg-pistachio',
  ];
  let hash = 0;
  for (let i = 0; i < seed.length; i++) {
    hash = seed.charCodeAt(i) + ((hash << 5) - hash);
  }
  return colors[Math.abs(hash) % colors.length];
}

export function isOverdue(fechaLimite: string | null, estado: string): boolean {
  if (!fechaLimite || estado === 'hecho') return false;
  return new Date(fechaLimite) < new Date(new Date().toDateString());
}

export function daysUntil(fecha: string | null): number | null {
  if (!fecha) return null;
  const target = new Date(fecha + 'T00:00:00');
  const today = new Date(new Date().toDateString());
  return Math.ceil((target.getTime() - today.getTime()) / 86400000);
}
