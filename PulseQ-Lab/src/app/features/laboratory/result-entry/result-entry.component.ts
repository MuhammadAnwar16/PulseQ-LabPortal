import { Component, inject, OnDestroy, OnInit, PLATFORM_ID, signal } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Subscription } from 'rxjs';

import { ApiService } from '../../../core/api.service';
import { AuthService } from '../../../core/auth.service';
import { LabRealtimeService } from '../../../core/services/realtime.service';
import { ToastService } from '../../../core/toast.service';
import { LabTestCatalog, LabTestOrder, ResultValue } from '../../../core/models/laboratory.models';
import { prioritySeverity, statusLabel, statusSeverity } from '../../../shared/utils/status.util';

interface ParamRow {
  param: string;
  unit?: string | null;
  low?: number | null;
  high?: number | null;
  value: string;
  abnormal: boolean;
}

@Component({
  selector: 'app-result-entry',
  standalone: true,
  imports: [FormsModule],
  template: `
    <div class="pq-page">
      <div class="pq-page-header">
        <div><h1>Result Entry</h1><p>Enter parameter values against each test</p></div>
      </div>

      <div class="pq-grid two-col">
        <!-- Orders to enter -->
        <div class="pq-card" style="padding:0; overflow:hidden;">
          <div class="card-header" style="padding: 1.25rem 1.5rem 0.75rem; border-bottom: 1px solid var(--pq-border);">
            <h3 style="margin:0; font-weight:700;">Orders</h3>
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
                      <button class="pq-btn pq-btn-text" (click)="selectOrder(o)">Enter</button>
                    </td>
                  </tr>
                } @empty {
                  <tr>
                    <td colspan="3" class="pq-muted" style="text-align:center; padding:2rem;">
                      No orders pending results.
                    </td>
                  </tr>
                }
              </tbody>
            </table>
          </div>
        </div>

        <!-- Parameter form -->
        <div class="pq-card">
          @if (!selectedOrder()) {
            <p class="pq-muted" style="text-align:center; padding: 3rem 0;">
              <i class="pi pi-file-edit" style="font-size: 2.5rem; display:block; margin-bottom:0.75rem; color:var(--pq-slate-300);"></i>
              Select an order from the list to begin entering results.
            </p>
          } @else {
            <h3 style="margin-top:0; font-weight:700;">{{ selectedOrder()!.patient_name }}</h3>
            <p class="pq-muted" style="margin-bottom:1rem;">Choose a test below, then enter values.</p>

            <div class="test-tabs">
              @for (t of selectedOrder()!.tests; track t.id) {
                <button class="test-tab" [class.active]="selectedTest()?.id === t.id"
                        (click)="selectTest(t)">{{ t.name }}</button>
              }
            </div>

            @if (selectedTest(); as test) {
              <div class="params" style="margin-top:1.5rem;">
                @if (params().length === 0) {
                  <p class="pq-muted">This test has no defined parameters. Use the note field below.</p>
                }
                @for (p of params(); track p.param) {
                  <div class="param-row" [class.abn]="p.abnormal">
                    <label style="font-weight: 500;">
                      {{ p.param }}
                      @if (p.unit) { <span class="pq-muted" style="font-size: 0.8rem;">({{ p.unit }})</span> }
                      @if (p.low != null && p.high != null) {
                        <span class="ref">ref {{ p.low }}–{{ p.high }}</span>
                      }
                    </label>
                    <div class="param-input">
                      <input class="pq-input" style="width: 140px;" [(ngModel)]="p.value" (ngModelChange)="recompute(p)" placeholder="Value" />
                      @if (p.abnormal) { <i class="pi pi-exclamation-circle abn-icon" title="Abnormal value"></i> }
                    </div>
                  </div>
                }
                <label class="field" style="margin-top: 1rem;"><span>Note (optional)</span>
                  <input class="pq-input" [(ngModel)]="note" placeholder="e.g. hemolyzed sample" /></label>
              </div>

              <div class="form-actions">
                <button class="pq-btn pq-btn-outline" (click)="save(false)">Save Draft</button>
                <button class="pq-btn pq-btn-primary" (click)="save(true)">Submit for Verification</button>
              </div>
            }
          }
        </div>
      </div>
    </div>
  `,
  styles: [
    `
      .two-col { grid-template-columns: 1fr 1.3fr; }
      @media (max-width: 900px) { .two-col { grid-template-columns: 1fr; } }
      .test-tabs { display: flex; flex-wrap: wrap; gap: 0.5rem; margin: 0.75rem 0; }
      .test-tab {
        border: 1px solid var(--pq-border);
        background: var(--pq-surface);
        border-radius: 8px;
        padding: 0.4rem 0.7rem;
        cursor: pointer;
        font-size: 0.85rem;
        color: var(--pq-slate-700);
        font-weight: 500;
        transition: all 0.2s;
      }
      .test-tab.active { background: var(--pq-blue-50); border-color: var(--pq-blue-300); color: var(--pq-blue-700); font-weight: 600; }
      .params { display: flex; flex-direction: column; gap: 0.75rem; }
      .param-row { display: flex; align-items: center; justify-content: space-between; gap: 1rem; padding: 0.25rem 0; border-bottom: 1px solid var(--pq-slate-100); }
      .param-row label { font-size: 0.88rem; color: var(--pq-slate-700); }
      .ref { font-size: 0.75rem; color: var(--pq-slate-400); margin-left: 0.4rem; }
      .param-input { display: flex; align-items: center; gap: 0.4rem; }
      .param-row.abn input { border-color: var(--pq-danger-500); color: var(--pq-danger-600); background-color: var(--pq-danger-50); }
      .abn-icon { color: var(--pq-danger-500); font-size: 1.1rem; }
      .field { display: flex; flex-direction: column; gap: 0.35rem; margin-top: 0.5rem; }
      .field span { font-size: 0.82rem; color: var(--pq-slate-600); font-weight: 500; }
      .form-actions { display: flex; gap: 0.75rem; margin-top: 1.5rem; }
    `,
  ],
})
export class ResultEntryComponent implements OnInit, OnDestroy {
  private api = inject(ApiService);
  private toast = inject(ToastService);
  private auth = inject(AuthService);
  private realtime = inject(LabRealtimeService);
  private platformId = inject(PLATFORM_ID);
  private isBrowser = isPlatformBrowser(this.platformId);

  private sub?: Subscription;

  readonly orders = signal<LabTestOrder[]>([]);
  loading = false;
  readonly selectedOrder = signal<LabTestOrder | null>(null);
  readonly selectedTest = signal<LabTestCatalog | null>(null);
  readonly params = signal<ParamRow[]>([]);
  note = '';

  ngOnInit(): void {
    if (!this.isBrowser) return;

    this.reload();

    const user = this.auth.user();
    if (user?.hospital_id) {
      const room = `hospital_${user.hospital_id}`;
      this.sub = this.realtime.connect(room).subscribe((msg) => {
        if (msg && (msg.type === 'lab_queue_update' || msg.type === 'lab_result_saved' || msg.type === 'lab_order_updated')) {
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
    this.api.listOrders({}).subscribe({
      next: (rows) => {
        this.orders.set(
          rows.filter((o) => ['sample_collected', 'processing', 'completed'].includes(o.status)),
        );
        this.loading = false;
      },
      error: () => {
        this.loading = false;
        this.toast.add({ severity: 'error', summary: 'Error', detail: 'Could not load orders' });
      },
    });
  }

  selectOrder(o: LabTestOrder): void {
    this.selectedOrder.set(o);
    this.selectedTest.set(null);
    this.params.set([]);
    this.note = '';
  }

  selectTest(t: LabTestCatalog): void {
    this.selectedTest.set(t);
    this.params.set(
      (t.reference_ranges || []).map((r) => ({
        param: r.param,
        unit: r.unit,
        low: r.low,
        high: r.high,
        value: '',
        abnormal: false,
      })),
    );
  }

  recompute(p: ParamRow): void {
    if (p.value === '' || p.low == null || p.high == null) {
      p.abnormal = false;
      return;
    }
    const v = Number(p.value);
    p.abnormal = !Number.isNaN(v) && (v < (p.low as number) || v > (p.high as number));
  }

  save(submit: boolean): void {
    const order = this.selectedOrder();
    const test = this.selectedTest();
    if (!order || !test) return;
    const values: ResultValue[] = this.params().map((p) => ({
      param: p.param,
      value: p.value || null,
      unit: p.unit,
      low: p.low,
      high: p.high,
      abnormal: p.abnormal,
    }));
    const anyAbnormal = values.some((v) => v.abnormal);
    this.api
      .saveResult(order.id, {
        test_id: test.id,
        result_values: values,
        abnormal_flag: anyAbnormal ? 'abnormal' : 'normal',
        entered_by: this.auth.user()?.full_name || 'Lab Staff',
        submit,
      })
      .subscribe({
        next: () => {
          this.toast.add({
            severity: 'success',
            summary: submit ? 'Submitted' : 'Draft saved',
            detail: `${test.name} for ${order.patient_name}`,
          });
          this.selectedTest.set(null);
          this.params.set([]);
          this.reload();
          if (order) {
            this.api.getOrder(order.id).subscribe((updated) => this.selectedOrder.set(updated));
          }
        },
        error: (e) => this.toast.add({ severity: 'error', detail: e?.error?.detail || 'Failed' }),
      });
  }

  protected readonly prioritySeverity = prioritySeverity;
  protected readonly statusSeverity = statusSeverity;
  protected readonly statusLabel = statusLabel;
}

