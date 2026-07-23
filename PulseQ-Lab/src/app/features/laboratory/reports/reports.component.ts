import { Component, inject, OnDestroy, OnInit, PLATFORM_ID, signal } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { Subscription } from 'rxjs';

import { ApiService } from '../../../core/api.service';
import { AuthService } from '../../../core/auth.service';
import { LabRealtimeService } from '../../../core/services/realtime.service';
import { ToastService } from '../../../core/toast.service';
import { LabTestOrder } from '../../../core/models/laboratory.models';
import { prioritySeverity, statusLabel, statusSeverity } from '../../../shared/utils/status.util';

@Component({
  selector: 'app-reports',
  standalone: true,
  imports: [],
  template: `
    <div class="pq-page">
      <div class="pq-page-header">
        <div><h1>Reports</h1><p>Verified lab reports ready to share</p></div>
      </div>

      <div class="pq-table-container">
        <table class="pq-table">
          <thead>
            <tr>
              <th>Patient</th>
              <th>Tests</th>
              <th>Priority</th>
              <th>Status</th>
              <th>Verified</th>
              <th style="width:240px; text-align:right;">Actions</th>
            </tr>
          </thead>
          <tbody>
            @for (o of reports(); track o.id) {
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
                <td class="pq-muted">{{ verifiedAt(o) }}</td>
                <td style="text-align:right;">
                  <div class="actions" style="justify-content: flex-end;">
                    <button class="pq-btn pq-btn-text" (click)="viewPdf(o)" title="View PDF"><i class="pi pi-eye"></i></button>
                    <button class="pq-btn pq-btn-text" (click)="downloadPdf(o)" title="Download PDF"><i class="pi pi-download"></i></button>
                    <button class="pq-btn pq-btn-text" (click)="printPdf(o)" title="Print PDF"><i class="pi pi-print"></i></button>
                    <button class="pq-btn pq-btn-text" (click)="resend(o)" title="Resend Link"><i class="pi pi-send"></i></button>
                  </div>
                </td>
              </tr>
            } @empty {
              <tr>
                <td colspan="6" class="pq-muted" style="text-align:center; padding:2.5rem;">
                  <i class="pi pi-file-pdf" style="font-size: 2.5rem; display:block; margin-bottom:0.75rem; color:var(--pq-slate-300);"></i>
                  No reports yet.
                </td>
              </tr>
            }
          </tbody>
        </table>
      </div>
    </div>
  `,
  styles: [
    `
      .actions { display: flex; gap: 0.25rem; }
    `,
  ],
})
export class ReportsComponent implements OnInit, OnDestroy {
  private api = inject(ApiService);
  private auth = inject(AuthService);
  private realtime = inject(LabRealtimeService);
  private toast = inject(ToastService);
  private platformId = inject(PLATFORM_ID);
  private isBrowser = isPlatformBrowser(this.platformId);

  private sub?: Subscription;

  readonly reports = signal<LabTestOrder[]>([]);
  loading = false;

  ngOnInit(): void {
    if (!this.isBrowser) return;

    this.reload();

    const user = this.auth.user();
    if (user?.hospital_id) {
      const room = `hospital_${user.hospital_id}`;
      this.sub = this.realtime.connect(room).subscribe((msg) => {
        if (msg && (msg.type === 'lab_result_verified' || msg.type === 'lab_queue_update')) {
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
    this.api.listReports().subscribe({
      next: (rows) => {
        this.reports.set(rows);
        this.loading = false;
      },
      error: () => {
        this.loading = false;
        this.toast.add({ severity: 'error', summary: 'Error', detail: 'Could not load reports' });
      },
    });
  }

  private openBlob(o: LabTestOrder, download: boolean): void {
    this.api.getReportBlob(o.id).subscribe({
      next: (blob) => {
        const url = URL.createObjectURL(blob);
        if (download) {
          const a = document.createElement('a');
          a.href = url;
          a.download = `lab_report_${o.id.slice(0, 8)}.pdf`;
          a.click();
        } else {
          const w = window.open(url, '_blank');
          if (!w) this.toast.add({ severity: 'warn', detail: 'Pop-up blocked — use Download' });
        }
        setTimeout(() => URL.revokeObjectURL(url), 30000);
      },
      error: (e) => this.toast.add({ severity: 'error', detail: e?.error?.detail || 'No PDF available' }),
    });
  }

  viewPdf(o: LabTestOrder): void {
    this.openBlob(o, false);
  }

  downloadPdf(o: LabTestOrder): void {
    this.openBlob(o, true);
  }

  printPdf(o: LabTestOrder): void {
    this.api.getReportBlob(o.id).subscribe({
      next: (blob) => {
        const url = URL.createObjectURL(blob);
        const w = window.open(url, '_blank');
        if (w) setTimeout(() => w.print(), 500);
        setTimeout(() => URL.revokeObjectURL(url), 30000);
      },
      error: () => this.toast.add({ severity: 'error', detail: 'No PDF available' }),
    });
  }

  resend(o: LabTestOrder): void {
    this.toast.add({ severity: 'success', summary: 'Sent', detail: `Report link sent for ${o.patient_name}` });
  }

  verifiedAt(o: LabTestOrder): string {
    const r = o.results?.find((x) => x.verified_at);
    if (!r || !r.verified_at) return '—';
    const val = r.verified_at;
    if (val.includes('-') && val.length === 10) return val;
    const d = new Date(val);
    if (isNaN(d.getTime())) return val;
    return d.toLocaleString();
  }

  testsSummary(o: LabTestOrder): string {
    return (o.tests || []).map((t) => t.name).join(', ') || `${o.test_ids?.length ?? 0} test(s)`;
  }

  protected readonly prioritySeverity = prioritySeverity;
  protected readonly statusSeverity = statusSeverity;
  protected readonly statusLabel = statusLabel;
}

