import { Component, inject, OnDestroy, OnInit, PLATFORM_ID, signal } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Subscription } from 'rxjs';

import { ApiService } from '../../../core/api.service';
import { AuthService } from '../../../core/auth.service';
import { LabRealtimeService } from '../../../core/services/realtime.service';
import { ToastService } from '../../../core/toast.service';
import { LabTestOrder } from '../../../core/models/laboratory.models';
import { prioritySeverity, statusLabel, statusSeverity } from '../../../shared/utils/status.util';

@Component({
  selector: 'app-sample-collection',
  standalone: true,
  imports: [FormsModule],
  template: `
    <div class="pq-page">
      <div class="pq-page-header">
        <div><h1>Sample Collection</h1><p>Capture samples for ordered tests</p></div>
        <select class="pq-select" style="width: auto; min-width: 160px;" [(ngModel)]="filter" (change)="reload()">
          @for (opt of filterOpts; track opt.value) {
            <option [value]="opt.value">{{ opt.label }}</option>
          }
        </select>
      </div>

      <div class="pq-table-container">
        <table class="pq-table">
          <thead>
            <tr>
              <th>Patient</th><th>Tests</th><th>Priority</th><th>Status</th>
              <th>Barcode</th><th>Collected by</th><th style="width:140px; text-align:right;">Action</th>
            </tr>
          </thead>
          <tbody>
            @for (o of orders(); track o.id) {
              <tr>
                <td style="font-weight: 600; color: var(--pq-slate-900);">{{ o.patient_name }}</td>
                <td>{{ testsSummary(o) }}</td>
                <td>
                  <span class="pq-badge" [class]="'pq-badge-' + prioritySeverity(o.priority)">
                    {{ o.priority }}
                  </span>
                </td>
                <td>
                  <span class="pq-badge" [class]="'pq-badge-' + statusSeverity(o.status)">
                    {{ statusLabel(o.status) }}
                  </span>
                </td>
                <td class="mono">{{ o.sample_barcode || '—' }}</td>
                <td>{{ o.collected_by || '—' }}</td>
                <td style="text-align:right;">
                  @if (o.status === 'ordered') {
                    <button class="pq-btn pq-btn-primary pq-btn-sm" (click)="open(o)">
                      <i class="pi pi-box"></i> Collect
                    </button>
                  } @else {
                    <span class="pq-muted" style="font-size:0.85rem;">Collected</span>
                  }
                </td>
              </tr>
            } @empty {
              <tr>
                <td colspan="7" class="pq-muted" style="text-align:center; padding: 2.5rem;">
                  <i class="pi pi-box" style="font-size: 2rem; display: block; margin-bottom: 0.5rem; color: var(--pq-slate-300);"></i>
                  No orders to show.
                </td>
              </tr>
            }
          </tbody>
        </table>
      </div>
    </div>

    <!-- Collect Sample Modal -->
    @if (visible) {
      <div class="pq-modal-backdrop" (click)="visible = false">
        <div class="pq-modal" (click)="$event.stopPropagation()">
          <div class="pq-modal-header">
            <h3>Collect Sample</h3>
            <button class="pq-modal-close" (click)="visible = false">&times;</button>
          </div>
          <div class="pq-modal-body">
            @if (active) {
              <div class="dialog-body">
                <p class="pq-muted" style="margin-top:0;">{{ active.patient_name }} — {{ testsSummary(active) }}</p>
                <label class="field"><span>Sample Barcode</span>
                  <input class="pq-input" [(ngModel)]="barcode" placeholder="e.g. BC-0001" /></label>
                <label class="field"><span>Collected By</span>
                  <input class="pq-input" [(ngModel)]="collectedBy" placeholder="Phlebotomist name" /></label>
                <label class="field"><span>Collection Time</span>
                  <input type="datetime-local" class="pq-input" [(ngModel)]="collectedAt" /></label>
              </div>
            }
          </div>
          <div class="pq-modal-footer">
            <button class="pq-btn pq-btn-outline" (click)="visible = false">Cancel</button>
            <button class="pq-btn pq-btn-primary" (click)="collect()">Mark Collected</button>
          </div>
        </div>
      </div>
    }
  `,
  styles: [
    `
      .mono { font-family: ui-monospace, monospace; font-size: 0.8rem; color: var(--pq-slate-500); }
      .dialog-body { display: flex; flex-direction: column; gap: 0.85rem; }
      .field { display: flex; flex-direction: column; gap: 0.35rem; }
      .field span { font-size: 0.82rem; color: var(--pq-slate-600); font-weight: 500; }
    `,
  ],
})
export class SampleCollectionComponent implements OnInit, OnDestroy {
  private api = inject(ApiService);
  private auth = inject(AuthService);
  private realtime = inject(LabRealtimeService);
  private toast = inject(ToastService);
  private platformId = inject(PLATFORM_ID);
  private isBrowser = isPlatformBrowser(this.platformId);

  private sub?: Subscription;

  readonly orders = signal<LabTestOrder[]>([]);
  loading = false;

  filter = 'ordered';
  readonly filterOpts = [
    { label: 'To collect', value: 'ordered' },
    { label: 'All', value: 'all' },
  ];

  visible = false;
  active: LabTestOrder | null = null;
  barcode = '';
  collectedBy = '';
  collectedAt = '';

  ngOnInit(): void {
    if (!this.isBrowser) return;

    this.reload();

    const user = this.auth.user();
    if (user?.hospital_id) {
      const room = `hospital_${user.hospital_id}`;
      this.sub = this.realtime.connect(room).subscribe((msg) => {
        if (msg && (msg.type === 'lab_queue_update' || msg.type === 'lab_order_created' || msg.type === 'lab_order_updated')) {
          this.reload();
        }
      });
    }
  }

  ngOnDestroy(): void {
    this.sub?.unsubscribe();
  }

  reload(): void {
    this.loading = true;
    const params = this.filter === 'ordered' ? { status: 'ordered' } : {};
    this.api.listOrders(params).subscribe({
      next: (rows) => {
        this.orders.set(rows);
        this.loading = false;
      },
      error: () => {
        this.loading = false;
        this.toast.add({ severity: 'error', summary: 'Error', detail: 'Could not load orders' });
      },
    });
  }

  open(o: LabTestOrder): void {
    this.active = o;
    this.barcode = '';
    this.collectedBy = '';
    this.collectedAt = '';
    this.visible = true;
  }

  collect(): void {
    if (!this.active || !this.barcode || !this.collectedBy) {
      this.toast.add({ severity: 'warn', detail: 'Barcode and collector required' });
      return;
    }
    this.api
      .collectSample(this.active.id, {
        sample_barcode: this.barcode,
        collected_by: this.collectedBy,
        collected_at: this.collectedAt || null,
      })
      .subscribe({
        next: () => {
          this.toast.add({ severity: 'success', summary: 'Collected', detail: this.active!.patient_name });
          this.visible = false;
        },
        error: (e) => this.toast.add({ severity: 'error', detail: e?.error?.detail || 'Failed' }),
      });
  }

  testsSummary(o: LabTestOrder): string {
    return (o.tests || []).map((t) => t.name).join(', ') || `${o.test_ids?.length ?? 0} test(s)`;
  }

  protected readonly prioritySeverity = prioritySeverity;
  protected readonly statusSeverity = statusSeverity;
  protected readonly statusLabel = statusLabel;
}
