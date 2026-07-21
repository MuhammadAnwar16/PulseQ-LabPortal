import { Component, inject, OnDestroy, OnInit, PLATFORM_ID, signal } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Subscription } from 'rxjs';

import { ApiService } from '../../../core/api.service';
import { AuthService } from '../../../core/auth.service';
import { LabRealtimeService } from '../../../core/services/realtime.service';
import { ToastService } from '../../../core/toast.service';
import { LabSupplier } from '../../../core/models/laboratory.models';

interface SupplierForm {
  name: string;
  contact: string | null;
  outstanding_balance: number;
}

interface PaymentForm {
  amount: number;
  note: string | null;
}

@Component({
  selector: 'app-suppliers',
  standalone: true,
  imports: [FormsModule],
  template: `
    <div class="pq-page">
      <div class="pq-page-header">
        <div><h1>Suppliers</h1><p>Vendors and their outstanding balances</p></div>
        <button class="pq-btn pq-btn-primary" (click)="openNew()"><i class="pi pi-plus"></i> Add Supplier</button>
      </div>

      <div class="pq-table-container">
        <table class="pq-table">
          <thead>
            <tr>
              <th>Name</th><th>Contact</th><th>Outstanding</th>
              <th style="width:200px; text-align:right;">Actions</th>
            </tr>
          </thead>
          <tbody>
            @for (r of suppliers(); track r.id) {
              <tr>
                <td style="font-weight: 600; color: var(--pq-slate-900);">{{ r.name }}</td>
                <td>{{ r.contact || '—' }}</td>
                <td>
                  @if (r.outstanding_balance > 0) {
                    <span class="pq-badge pq-badge-danger">
                      {{ money(r.outstanding_balance) }}
                    </span>
                  } @else {
                    <span class="pq-muted">{{ money(0) }}</span>
                  }
                </td>
                <td style="text-align:right;">
                  <div class="actions" style="justify-content: flex-end;">
                    <button class="pq-btn pq-btn-text" (click)="openPay(r)"><i class="pi pi-dollar"></i> Pay</button>
                    <button class="pq-btn pq-btn-text" (click)="openEdit(r)"><i class="pi pi-pencil"></i></button>
                    <button class="pq-btn pq-btn-text-danger" (click)="remove(r)"><i class="pi pi-trash"></i></button>
                  </div>
                </td>
              </tr>
            } @empty {
              <tr>
                <td colspan="4" class="pq-muted" style="text-align:center; padding:2.5rem;">
                  <i class="pi pi-truck" style="font-size: 2rem; display: block; margin-bottom: 0.5rem; color: var(--pq-slate-300);"></i>
                  No suppliers yet.
                </td>
              </tr>
            }
          </tbody>
        </table>
      </div>
    </div>

    <!-- Add/Edit Supplier Modal -->
    @if (dialogVisible) {
      <div class="pq-modal-backdrop" (click)="dialogVisible = false">
        <div class="pq-modal" (click)="$event.stopPropagation()">
          <div class="pq-modal-header">
            <h3>{{ editingId ? 'Edit Supplier' : 'Add Supplier' }}</h3>
            <button class="pq-modal-close" (click)="dialogVisible = false">&times;</button>
          </div>
          <div class="pq-modal-body">
            @if (active) {
              @let a = active;
              <div class="dialog-body">
                <label class="field"><span>Name</span>
                  <input class="pq-input" [(ngModel)]="a.name" placeholder="e.g. BioMed Supplies" /></label>
                <label class="field"><span>Contact</span>
                  <input class="pq-input" [(ngModel)]="a.contact" placeholder="Phone / email" /></label>
                @if (!editingId) {
                  <label class="field"><span>Outstanding Balance ($)</span>
                    <input type="number" class="pq-input" [(ngModel)]="a.outstanding_balance" step="0.01" /></label>
                }
              </div>
            }
          </div>
          <div class="pq-modal-footer">
            <button class="pq-btn pq-btn-outline" (click)="dialogVisible = false">Cancel</button>
            <button class="pq-btn pq-btn-primary" (click)="save()">Save</button>
          </div>
        </div>
      </div>
    }

    <!-- Record Payment Modal -->
    @if (payVisible) {
      <div class="pq-modal-backdrop" (click)="payVisible = false">
        <div class="pq-modal" (click)="$event.stopPropagation()">
          <div class="pq-modal-header">
            <h3>Record Payment — {{ paySupplierName }}</h3>
            <button class="pq-modal-close" (click)="payVisible = false">&times;</button>
          </div>
          <div class="pq-modal-body">
            @if (payment) {
              @let p = payment;
              <div class="dialog-body">
                <label class="field"><span>Amount ($)</span>
                  <input type="number" class="pq-input" [(ngModel)]="p.amount" step="0.01" /></label>
                <label class="field"><span>Note</span>
                  <input class="pq-input" [(ngModel)]="p.note" placeholder="Optional reference" /></label>
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
      .actions { display: flex; gap: 0.25rem; }
      .dialog-body { display: flex; flex-direction: column; gap: 0.85rem; }
      .field { display: flex; flex-direction: column; gap: 0.35rem; }
      .field span { font-size: 0.82rem; color: var(--pq-slate-600); font-weight: 500; }
    `,
  ],
})
export class SuppliersComponent implements OnInit, OnDestroy {
  private api = inject(ApiService);
  private auth = inject(AuthService);
  private realtime = inject(LabRealtimeService);
  private toast = inject(ToastService);
  private platformId = inject(PLATFORM_ID);
  private isBrowser = isPlatformBrowser(this.platformId);

  private sub?: Subscription;

  readonly suppliers = signal<LabSupplier[]>([]);
  loading = false;

  dialogVisible = false;
  editingId: string | null = null;
  active: SupplierForm | null = null;

  payVisible = false;
  paySupplierId: string | null = null;
  paySupplierName = '';
  payment: PaymentForm | null = null;

  ngOnInit(): void {
    if (!this.isBrowser) return;

    this.load();

    const user = this.auth.user();
    if (user?.hospital_id) {
      const room = `hospital_${user.hospital_id}`;
      this.sub = this.realtime.connect(room).subscribe((msg) => {
        if (msg && msg.type === 'lab_supplier_updated') {
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
    this.api.listSuppliers().subscribe({
      next: (rows) => {
        this.suppliers.set(rows);
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
    this.editingId = null;
    this.active = { name: '', contact: null, outstanding_balance: 0 };
    this.dialogVisible = true;
  }

  openEdit(r: LabSupplier): void {
    this.editingId = r.id;
    this.active = {
      name: r.name,
      contact: r.contact || null,
      outstanding_balance: r.outstanding_balance,
    };
    this.dialogVisible = true;
  }

  save(): void {
    if (!this.active || !this.active.name) {
      this.toast.add({ severity: 'warn', detail: 'Name is required' });
      return;
    }
    if (this.editingId) {
      this.api
        .updateSupplier(this.editingId, {
          name: this.active.name,
          contact: this.active.contact || null,
        })
        .subscribe({
          next: () => {
            this.toast.add({ severity: 'success', summary: 'Saved', detail: this.active!.name });
            this.dialogVisible = false;
          },
          error: (e) =>
            this.toast.add({ severity: 'error', summary: 'Error', detail: e?.error?.detail || 'Failed' }),
        });
    } else {
      this.api
        .createSupplier({
          name: this.active.name,
          contact: this.active.contact || null,
          outstanding_balance: this.active.outstanding_balance,
        })
        .subscribe({
          next: () => {
            this.toast.add({ severity: 'success', summary: 'Saved', detail: this.active!.name });
            this.dialogVisible = false;
          },
          error: (e) =>
            this.toast.add({ severity: 'error', summary: 'Error', detail: e?.error?.detail || 'Failed' }),
        });
    }
  }

  openPay(r: LabSupplier): void {
    this.paySupplierId = r.id;
    this.paySupplierName = r.name;
    this.payment = { amount: r.outstanding_balance > 0 ? r.outstanding_balance : 0, note: null };
    this.payVisible = true;
  }

  recordPayment(): void {
    if (!this.paySupplierId || !this.payment) return;
    this.api
      .paySupplier(this.paySupplierId, this.payment.amount, this.payment.note || null)
      .subscribe({
        next: () => {
          this.toast.add({ severity: 'success', summary: 'Payment recorded', detail: short(this.paySupplierId!) });
          this.payVisible = false;
        },
        error: (e) =>
          this.toast.add({ severity: 'error', summary: 'Error', detail: e?.error?.detail || 'Failed' }),
      });
  }

  remove(r: LabSupplier): void {
    this.api.deleteSupplier(r.id).subscribe({
      next: () => {
        this.toast.add({ severity: 'success', summary: 'Deleted', detail: short(r.id) });
      },
      error: (e) =>
        this.toast.add({ severity: 'error', summary: 'Error', detail: e?.error?.detail || 'Failed' }),
    });
  }
}

function short(id: string): string {
  return id.slice(0, 8);
}
