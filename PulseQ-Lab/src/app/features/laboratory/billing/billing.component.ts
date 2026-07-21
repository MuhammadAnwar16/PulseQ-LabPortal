import { Component, inject, OnDestroy, OnInit, PLATFORM_ID, signal } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Subscription } from 'rxjs';

import { ApiService } from '../../../core/api.service';
import { AuthService } from '../../../core/auth.service';
import { LabRealtimeService } from '../../../core/services/realtime.service';
import { ToastService } from '../../../core/toast.service';
import { LabInvoice } from '../../../core/models/laboratory.models';
import { invoiceSeverity } from '../../../shared/utils/status.util';

interface InvoiceForm {
  order_id: string;
  amount: number;
  payment_method: string | null;
}

interface PaymentForm {
  amount: number;
  method: string | null;
}

@Component({
  selector: 'app-billing',
  standalone: true,
  imports: [FormsModule],
  template: `
    <div class="pq-page">
      <div class="pq-page-header">
        <div><h1>Billing</h1><p>Invoices, payments and outstanding balances</p></div>
        <button class="pq-btn pq-btn-primary" (click)="openNew()"><i class="pi pi-plus"></i> Create Invoice</button>
      </div>

      <div class="pq-table-container">
        <table class="pq-table">
          <thead>
            <tr>
              <th>Order ID</th><th>Amount</th><th>Paid</th><th>Balance</th>
              <th>Status</th><th>Method</th><th style="width:200px; text-align:right;">Actions</th>
            </tr>
          </thead>
          <tbody>
            @for (r of invoices(); track r.id) {
              <tr>
                <td class="mono">{{ shortId(r.order_id) }}</td>
                <td>{{ money(r.amount) }}</td>
                <td>{{ money(r.paid_amount) }}</td>
                <td>{{ money(r.amount - r.paid_amount) }}</td>
                <td>
                  <span class="pq-badge" [class]="'pq-badge-' + invoiceSeverity(r.status)">
                    {{ r.status }}
                  </span>
                </td>
                <td>{{ r.payment_method || '—' }}</td>
                <td style="text-align:right;">
                  <div class="actions" style="justify-content: flex-end;">
                    <button class="pq-btn pq-btn-text" (click)="openPay(r)"><i class="pi pi-dollar"></i> Pay</button>
                    <button class="pq-btn pq-btn-text-danger" (click)="remove(r)"><i class="pi pi-trash"></i></button>
                  </div>
                </td>
              </tr>
            } @empty {
              <tr>
                <td colspan="7" class="pq-muted" style="text-align:center; padding:2.5rem;">
                  <i class="pi pi-receipt" style="font-size: 2rem; display: block; margin-bottom: 0.5rem; color: var(--pq-slate-300);"></i>
                  No invoices yet.
                </td>
              </tr>
            }
          </tbody>
        </table>
      </div>
    </div>

    <!-- Create Invoice Modal -->
    @if (createVisible) {
      <div class="pq-modal-backdrop" (click)="createVisible = false">
        <div class="pq-modal" (click)="$event.stopPropagation()">
          <div class="pq-modal-header">
            <h3>Create Invoice</h3>
            <button class="pq-modal-close" (click)="createVisible = false">&times;</button>
          </div>
          <div class="pq-modal-body">
            @if (create) {
              @let c = create;
              <div class="dialog-body">
                <label class="field"><span>Order ID</span>
                  <input class="pq-input" [(ngModel)]="c.order_id" placeholder="e.g. ORD-1001" /></label>
                <label class="field"><span>Amount ($)</span>
                  <input type="number" class="pq-input" [(ngModel)]="c.amount" step="0.01" /></label>
                <label class="field"><span>Payment Method</span>
                  <input class="pq-input" [(ngModel)]="c.payment_method" placeholder="e.g. Cash / Card" /></label>
              </div>
            }
          </div>
          <div class="pq-modal-footer">
            <button class="pq-btn pq-btn-outline" (click)="createVisible = false">Cancel</button>
            <button class="pq-btn pq-btn-primary" (click)="createInvoice()">Create</button>
          </div>
        </div>
      </div>
    }

    <!-- Record Payment Modal -->
    @if (payVisible) {
      <div class="pq-modal-backdrop" (click)="payVisible = false">
        <div class="pq-modal" (click)="$event.stopPropagation()">
          <div class="pq-modal-header">
            <h3>Record Payment</h3>
            <button class="pq-modal-close" (click)="payVisible = false">&times;</button>
          </div>
          <div class="pq-modal-body">
            @if (payment) {
              @let p = payment;
              <div class="dialog-body">
                <label class="field"><span>Payment Amount ($)</span>
                  <input type="number" class="pq-input" [(ngModel)]="p.amount" step="0.01" /></label>
                <label class="field"><span>Payment Method</span>
                  <input class="pq-input" [(ngModel)]="p.method" placeholder="e.g. Cash / Card / Transfer" /></label>
              </div>
            }
          </div>
          <div class="pq-modal-footer">
            <button class="pq-btn pq-btn-outline" (click)="payVisible = false">Cancel</button>
            <button class="pq-btn pq-btn-primary" (click)="recordPayment()">Record</button>
          </div>
        </div>
      </div>
    }
  `,
  styles: [
    `
      .mono { font-family: ui-monospace, monospace; font-size: 0.8rem; color: var(--pq-slate-500); }
      .actions { display: flex; gap: 0.25rem; }
      .dialog-body { display: flex; flex-direction: column; gap: 0.85rem; }
      .field { display: flex; flex-direction: column; gap: 0.35rem; }
      .field span { font-size: 0.82rem; color: var(--pq-slate-600); font-weight: 500; }
    `,
  ],
})
export class BillingComponent implements OnInit, OnDestroy {
  private api = inject(ApiService);
  private auth = inject(AuthService);
  private realtime = inject(LabRealtimeService);
  private toast = inject(ToastService);
  private platformId = inject(PLATFORM_ID);
  private isBrowser = isPlatformBrowser(this.platformId);

  private sub?: Subscription;

  readonly invoices = signal<LabInvoice[]>([]);
  loading = false;

  createVisible = false;
  create: InvoiceForm | null = null;

  payVisible = false;
  payInvoiceId: string | null = null;
  payment: PaymentForm | null = null;

  protected readonly invoiceSeverity = invoiceSeverity;

  ngOnInit(): void {
    if (!this.isBrowser) return;

    this.load();

    const user = this.auth.user();
    if (user?.hospital_id) {
      const room = `hospital_${user.hospital_id}`;
      this.sub = this.realtime.connect(room).subscribe((msg) => {
        if (msg && msg.type === 'lab_invoice_updated') {
          this.load();
        }
      });
    }
  }

  ngOnDestroy(): void {
    this.sub?.unsubscribe();
  }

  private load(): void {
    this.loading = true;
    this.api.listInvoices().subscribe({
      next: (rows) => {
        this.invoices.set(rows);
        this.loading = false;
      },
      error: (e) => {
        this.loading = false;
        this.toast.add({ severity: 'error', summary: 'Error', detail: e?.error?.detail || 'Failed' });
      },
    });
  }

  money(n: number): string {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
    }).format(n || 0);
  }

  openNew(): void {
    this.create = { order_id: '', amount: 0, payment_method: null };
    this.createVisible = true;
  }

  createInvoice(): void {
    if (!this.create || !this.create.order_id) {
      this.toast.add({ severity: 'warn', detail: 'Order ID is required' });
      return;
    }
    this.api
      .createInvoice({
        order_id: this.create.order_id,
        amount: this.create.amount,
        payment_method: this.create.payment_method || null,
      })
      .subscribe({
        next: () => {
          this.toast.add({ severity: 'success', summary: 'Created', detail: this.create!.order_id });
          this.createVisible = false;
        },
        error: (e) =>
          this.toast.add({ severity: 'error', summary: 'Error', detail: e?.error?.detail || 'Failed' }),
      });
  }

  openPay(r: LabInvoice): void {
    this.payInvoiceId = r.id;
    this.payment = { amount: Math.max(r.amount - r.paid_amount, 0), method: null };
    this.payVisible = true;
  }

  recordPayment(): void {
    if (!this.payInvoiceId || !this.payment) return;
    this.api
      .payInvoice(this.payInvoiceId, this.payment.amount, this.payment.method || null)
      .subscribe({
        next: () => {
          this.toast.add({ severity: 'success', summary: 'Payment recorded', detail: short(this.payInvoiceId!) });
          this.payVisible = false;
        },
        error: (e) =>
          this.toast.add({ severity: 'error', summary: 'Error', detail: e?.error?.detail || 'Failed' }),
      });
  }

  remove(r: LabInvoice): void {
    this.api.deleteInvoice(r.id).subscribe({
      next: () => {
        this.toast.add({ severity: 'success', summary: 'Deleted', detail: short(r.id) });
      },
      error: (e) =>
        this.toast.add({ severity: 'error', summary: 'Error', detail: e?.error?.detail || 'Failed' }),
    });
  }

  shortId(id: string): string {
    return id.slice(0, 8);
  }
}

function short(id: string): string {
  return id.slice(0, 8);
}
