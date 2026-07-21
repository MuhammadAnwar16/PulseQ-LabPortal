import { Component, inject, OnDestroy, OnInit, PLATFORM_ID, signal } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { Subscription } from 'rxjs';

import { ApiService } from '../../../core/api.service';
import { AuthService } from '../../../core/auth.service';
import { LabRealtimeService } from '../../../core/services/realtime.service';
import { ToastService } from '../../../core/toast.service';

interface TrashSection {
  key: string;
  label: string;
}

@Component({
  selector: 'app-trash',
  standalone: true,
  imports: [],
  template: `
    <div class="pq-page">
      <div class="pq-page-header">
        <div><h1>Trash</h1><p>Soft-deleted records — restore them if needed</p></div>
        <button class="pq-btn pq-btn-outline" (click)="load()"><i class="pi pi-refresh"></i> Refresh</button>
      </div>

      <div class="pq-grid trash-grid">
        @for (s of sections; track s.key) {
          <div class="pq-card">
            <h3 style="margin-top:0; font-weight:700; font-size:1rem; border-bottom:1px solid var(--pq-border); padding-bottom:0.5rem; margin-bottom:0.75rem;">
              {{ s.label }}
            </h3>
            @if (sectionRows(s.key).length) {
              <ul class="trash-list">
                @for (row of sectionRows(s.key); track row.id) {
                  <li>
                    <span class="row-label">
                      <span class="mono">{{ short(row.id) }}</span>
                      <span style="font-weight:600; color:var(--pq-slate-800);">{{ label(row) }}</span>
                    </span>
                    <button class="pq-btn pq-btn-text" (click)="restore(s.key, row.id)">
                      <i class="pi pi-replay"></i> Restore
                    </button>
                  </li>
                }
              </ul>
            } @else {
              <p class="pq-muted" style="text-align:center; padding:1.5rem 0; font-size:0.9rem;">Nothing in trash</p>
            }
          </div>
        }
      </div>
    </div>
  `,
  styles: [
    `
      .trash-grid {
        display: grid;
        grid-template-columns: repeat(auto-fill, minmax(320px, 1fr));
        gap: 1rem;
      }
      .trash-list { list-style: none; margin: 0; padding: 0; }
      .trash-list li {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 0.5rem;
        padding: 0.5rem 0;
        border-bottom: 1px solid var(--pq-border);
      }
      .trash-list li:last-child { border-bottom: none; }
      .row-label { display: flex; flex-direction: column; gap: 0.15rem; min-width: 0; }
      .row-label .mono { font-family: ui-monospace, monospace; font-size: 0.75rem; color: var(--pq-slate-500); }
      .row-label > span:last-child { font-size: 0.9rem; color: var(--pq-slate-800); }
    `,
  ],
})
export class TrashComponent implements OnInit, OnDestroy {
  private api = inject(ApiService);
  private auth = inject(AuthService);
  private realtime = inject(LabRealtimeService);
  private toast = inject(ToastService);
  private platformId = inject(PLATFORM_ID);
  private isBrowser = isPlatformBrowser(this.platformId);

  private sub?: Subscription;

  readonly trash = signal<Record<string, unknown[]>>({});
  loading = false;

  readonly sections: TrashSection[] = [
    { key: 'catalog', label: 'Test Catalog' },
    { key: 'order', label: 'Orders' },
    { key: 'inventory', label: 'Inventory' },
    { key: 'invoice', label: 'Invoices' },
    { key: 'supplier', label: 'Suppliers' },
    { key: 'expense', label: 'Expenses' },
  ];

  ngOnInit(): void {
    if (!this.isBrowser) return;

    this.load();

    const user = this.auth.user();
    if (user?.hospital_id) {
      const room = `hospital_${user.hospital_id}`;
      this.sub = this.realtime.connect(room).subscribe((msg) => {
        if (
          msg &&
          [
            'lab_trash_updated',
            'lab_catalog_updated',
            'lab_inventory_updated',
            'lab_invoice_updated',
            'lab_expense_updated',
            'lab_supplier_updated',
            'lab_queue_update',
          ].includes(msg.type || '')
        ) {
          this.load();
        }
      });
    }
  }

  ngOnDestroy(): void {
    this.sub?.unsubscribe();
  }

  load(): void {
    this.loading = true;
    this.api.listTrash().subscribe({
      next: (rows) => {
        this.trash.set(rows || {});
        this.loading = false;
      },
      error: (e) => {
        this.loading = false;
        this.toast.add({ severity: 'error', summary: 'Error', detail: e?.error?.detail || 'Failed' });
      },
    });
  }

  sectionRows(key: string): any[] {
    const v = this.trash()[key];
    return Array.isArray(v) ? (v as any[]) : [];
  }

  label(row: any): string {
    return row?.name || row?.patient_name || row?.order_id || row?.category || 'Item';
  }

  short(id: string): string {
    return (id || '').slice(0, 8);
  }

  restore(model: string, id: string): void {
    this.api.restore(model, id).subscribe({
      next: () => {
        this.toast.add({ severity: 'success', summary: 'Restored', detail: this.short(id) });
      },
      error: (e) =>
        this.toast.add({ severity: 'error', summary: 'Error', detail: e?.error?.detail || 'Failed' }),
    });
  }
}

