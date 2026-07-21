/** Maps lab statuses / priorities to PrimeNG tag severities + display labels. */

export type Severity = 'success' | 'info' | 'warn' | 'danger' | 'secondary' | 'contrast';

export function statusSeverity(status: string): Severity {
  switch (status) {
    case 'ordered':
      return 'secondary';
    case 'sample_collected':
      return 'info';
    case 'processing':
      return 'warn';
    case 'completed':
      return 'info';
    case 'reported':
      return 'success';
    case 'cancelled':
      return 'danger';
    default:
      return 'secondary';
  }
}

export function statusLabel(status: string): string {
  return status
    .split('_')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}

export function prioritySeverity(priority: string): Severity {
  switch (priority) {
    case 'urgent':
      return 'warn';
    case 'stat':
      return 'danger';
    case 'routine':
    default:
      return 'secondary';
  }
}

export function invoiceSeverity(status: string): Severity {
  switch (status) {
    case 'paid':
      return 'success';
    case 'partial':
      return 'warn';
    case 'unpaid':
    default:
      return 'danger';
  }
}

export function abnormalFlagSeverity(flag?: string | null): Severity {
  if (flag === 'abnormal' || flag === 'panic') return 'danger';
  return 'success';
}
