import { Injectable, signal } from '@angular/core';

export interface ToastMessage {
  id: string;
  severity: 'success' | 'error' | 'info' | 'warn';
  summary?: string;
  detail: string;
}

@Injectable({ providedIn: 'root' })
export class ToastService {
  readonly toasts = signal<ToastMessage[]>([]);

  add(msg: { severity?: 'success' | 'error' | 'info' | 'warn'; summary?: string; detail: string }) {
    const id = Math.random().toString(36).substring(2, 9);
    const severity = msg.severity || 'info';
    const newToast: ToastMessage = { id, severity, summary: msg.summary, detail: msg.detail };

    this.toasts.update((current) => [...current, newToast]);

    // Auto-dismiss after 4 seconds
    setTimeout(() => {
      this.remove(id);
    }, 4000);
  }

  remove(id: string) {
    this.toasts.update((current) => current.filter((t) => t.id !== id));
  }
}
