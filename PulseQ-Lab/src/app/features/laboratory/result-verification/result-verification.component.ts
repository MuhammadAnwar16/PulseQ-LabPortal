import { Component, inject, OnDestroy, OnInit, PLATFORM_ID, signal } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { Router } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { Subscription } from 'rxjs';

import { ApiService } from '../../../core/api.service';
import { AuthService } from '../../../core/auth.service';
import { LabRealtimeService } from '../../../core/services/realtime.service';
import { ToastService } from '../../../core/toast.service';
import { LabTestOrder, LabTestResult } from '../../../core/models/laboratory.models';
import { laboratoryPath } from '../../../shared/utils/portal-path.util';
import { abnormalFlagSeverity, statusLabel, statusSeverity } from '../../../shared/utils/status.util';

@Component({
  selector: 'app-result-verification',
  standalone: true,
  imports: [FormsModule],
  template: `
    <div class="pq-page">
      <div class="pq-page-header">
        <div><h1>Result Verification</h1><p>Second sign-off before report finalisation</p></div>
      </div>

      <div class="pq-grid two-col">
        <!-- Pending list -->
        <div class="pq-card" style="padding:0; overflow:hidden;">
          <div class="card-header" style="padding: 1.25rem 1.5rem 0.75rem; border-bottom: 1px solid var(--pq-border);">
            <h3 style="margin:0; font-weight:700;">Pending Verification</h3>
          </div>
          <div class="pq-table-container" style="border:none; border-radius:0; margin-top:0; box-shadow:none;">
            <table class="pq-table">
              <thead>
                <tr>
                  <th>Patient</th>
                  <th>Status</th>
                  <th style="width:80px; text-align:right;"></th>
                </tr>
              </thead>
              <tbody>
                @for (o of orders(); track o.id) {
                  <tr>
                    <td style="font-weight: 600; color: var(--pq-slate-900);">{{ o.patient_name }}</td>
                    <td>
                      <span class="pq-badge" [class]="'pq-badge-' + statusSeverity(o.status)">
                        {{ statusLabel(o.status) }}
                      </span>
                    </td>
                    <td style="text-align:right;">
                      <button class="pq-btn pq-btn-text" (click)="open(o)">Open</button>
                    </td>
                  </tr>
                } @empty {
                  <tr>
                    <td colspan="3" class="pq-muted" style="text-align:center; padding:2rem;">
                      Nothing pending verification.
                    </td>
                  </tr>
                }
              </tbody>
            </table>
          </div>
        </div>

        <!-- Detail Panel -->
        <div class="pq-card">
          @if (detail(); as d) {
            <h3 style="margin-top:0; font-weight:700;">{{ d.patient_name }}</h3>
            <p class="pq-muted" style="margin-bottom:1.5rem;">{{ (d.tests || []).map(t => t.name).join(', ') }}</p>

            @for (r of d.results || []; track r.id) {
              <div class="result-block">
                <div class="result-head">
                  <span style="font-weight: 700; color: var(--pq-slate-800);">{{ testName(d, r.test_id) }}</span>
                  <span class="pq-badge" [class]="r.status === 'verified' ? 'pq-badge-success' : 'pq-badge-warn'">
                    {{ r.status }}
                  </span>
                </div>
                
                <table class="vals">
                  <thead>
                    <tr><th>Param</th><th>Value</th><th>Ref</th><th>Flag</th></tr>
                  </thead>
                  <tbody>
                    @for (v of r.result_values; track v.param) {
                      <tr [class.abn]="v.abnormal">
                        <td style="font-weight:500;">{{ v.param }}</td>
                        <td>{{ v.value }} {{ v.unit }}</td>
                        <td class="pq-muted">{{ refText(v) }}</td>
                        <td>
                          @if (v.abnormal) { <i class="pi pi-exclamation-circle abn-icon" title="Abnormal"></i> }
                          @else { — }
                        </td>
                      </tr>
                    }
                  </tbody>
                </table>
                
                <div style="margin-top:1rem; display:flex; justify-content:flex-end;">
                  @if (r.status !== 'verified') {
                    <button class="pq-btn pq-btn-primary" (click)="verify(r)">
                      <i class="pi pi-check"></i> Verify & Finalise
                    </button>
                  } @else {
                    <button class="pq-btn pq-btn-outline" (click)="gotoReports()">
                      <i class="pi pi-file-pdf"></i> View Report
                    </button>
                  }
                </div>
              </div>
            }
          } @else {
            <p class="pq-muted" style="text-align:center; padding: 3rem 0;">
              <i class="pi pi-check-circle" style="font-size: 2.5rem; display:block; margin-bottom:0.75rem; color:var(--pq-slate-300);"></i>
              Select an order from the list to review its results.
            </p>
          }
        </div>
      </div>
    </div>
  `,
  styles: [
    `
      .two-col { grid-template-columns: 1fr 1.3fr; }
      @media (max-width: 900px) { .two-col { grid-template-columns: 1fr; } }
      .result-block { border: 1px solid var(--pq-border); border-radius: 10px; padding: 1rem; margin-bottom: 1rem; background: var(--pq-surface); }
      .result-head { display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.75rem; padding-bottom: 0.5rem; border-bottom: 1px dashed var(--pq-border); }
      .vals { width: 100%; border-collapse: collapse; font-size: 0.85rem; text-align: left; }
      .vals th { color: var(--pq-slate-500); font-weight: 600; padding: 0.5rem; }
      .vals td { padding: 0.5rem; border-top: 1px solid var(--pq-slate-100); }
      .vals tr.abn td { color: var(--pq-danger-600); background-color: var(--pq-danger-50); }
      .abn-icon { color: var(--pq-danger-500); font-size: 1.05rem; }
    `,
  ],
})
export class ResultVerificationComponent implements OnInit, OnDestroy {
  private api = inject(ApiService);
  private toast = inject(ToastService);
  private auth = inject(AuthService);
  private realtime = inject(LabRealtimeService);
  private router = inject(Router);
  private platformId = inject(PLATFORM_ID);
  private isBrowser = isPlatformBrowser(this.platformId);

  private sub?: Subscription;

  readonly orders = signal<LabTestOrder[]>([]);
  readonly detail = signal<LabTestOrder | null>(null);
  loading = false;

  ngOnInit(): void {
    if (!this.isBrowser) return;

    this.reload();

    const user = this.auth.user();
    if (user?.hospital_id) {
      const room = `hospital_${user.hospital_id}`;
      this.sub = this.realtime.connect(room).subscribe((msg) => {
        if (msg && (msg.type === 'lab_queue_update' || msg.type === 'lab_result_saved' || msg.type === 'lab_result_verified' || msg.type === 'lab_order_updated')) {
          this.reload();
          const d = this.detail();
          if (d && (msg.order_id === d.id || msg.data?.order_id === d.id)) {
            this.open(d);
          }
        }
      });
    }
  }

  ngOnDestroy(): void {
    this.sub?.unsubscribe();
  }

  reload(): void {
    this.loading = true;
    this.api.listOrders({}).subscribe({
      next: (rows) => {
        this.orders.set(
          rows.filter((o) => ['sample_collected', 'processing', 'completed', 'reported'].includes(o.status)),
        );
        this.loading = false;
      },
      error: () => {
        this.loading = false;
        this.toast.add({ severity: 'error', summary: 'Error', detail: 'Could not load orders' });
      },
    });
  }

  open(o: LabTestOrder): void {
    this.api.getOrder(o.id).subscribe({
      next: (d) => this.detail.set(d),
      error: (e) => this.toast.add({ severity: 'error', detail: e?.error?.detail || 'Failed' }),
    });
  }

  verify(r: LabTestResult): void {
    const d = this.detail();
    if (!d) return;
    this.api.verifyResult(d.id, r.id, this.auth.user()?.full_name || 'Verifier').subscribe({
      next: () => {
        this.toast.add({ severity: 'success', summary: 'Verified', detail: 'Report generated' });
        this.reload();
        this.open(d);
      },
      error: (e) => this.toast.add({ severity: 'error', detail: e?.error?.detail || 'Failed' }),
    });
  }

  gotoReports(): void {
    this.router.navigate([laboratoryPath('reports')]);
  }

  testName(o: LabTestOrder, testId: string): string {
    return o.tests?.find((t) => t.id === testId)?.name || testId;
  }

  refText(v: { low?: number | null; high?: number | null }): string {
    if (v.low != null && v.high != null) return `${v.low}–${v.high}`;
    return '—';
  }

  protected readonly statusSeverity = statusSeverity;
  protected readonly statusLabel = statusLabel;
  protected readonly abnormalFlagSeverity = abnormalFlagSeverity;
}

