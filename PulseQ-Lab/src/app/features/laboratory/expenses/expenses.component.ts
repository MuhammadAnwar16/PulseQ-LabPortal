import { Component, inject, OnDestroy, OnInit, PLATFORM_ID, signal } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Subscription } from 'rxjs';

import { ApiService } from '../../../core/api.service';
import { AuthService } from '../../../core/auth.service';
import { LabRealtimeService } from '../../../core/services/realtime.service';
import { ToastService } from '../../../core/toast.service';
import { LabExpense } from '../../../core/models/laboratory.models';

interface ExpenseForm {
  category: string;
  description: string | null;
  amount: number;
  incurred_on: string | null;
}

@Component({
  selector: 'app-expenses',
  standalone: true,
  imports: [FormsModule],
  template: `
    <div class="pq-page">
      <div class="pq-page-header">
        <div><h1>Expenses</h1><p>Track lab operating costs</p></div>
        <button class="pq-btn pq-btn-primary" (click)="openNew()"><i class="pi pi-plus"></i> Add Expense</button>
      </div>

      <div class="pq-table-container">
        <table class="pq-table">
          <thead>
            <tr>
              <th>Category</th><th>Description</th><th>Amount</th><th>Incurred On</th>
              <th style="width:120px; text-align:right;">Actions</th>
            </tr>
          </thead>
          <tbody>
            @for (r of expenses(); track r.id) {
              <tr>
                <td style="font-weight: 600; color: var(--pq-slate-900);">{{ r.category }}</td>
                <td>{{ r.description || '—' }}</td>
                <td>{{ money(r.amount) }}</td>
                <td>{{ r.incurred_on || '—' }}</td>
                <td style="text-align:right;">
                  <button class="pq-btn pq-btn-text-danger" (click)="remove(r)"><i class="pi pi-trash"></i></button>
                </td>
              </tr>
            } @empty {
              <tr>
                <td colspan="5" class="pq-muted" style="text-align:center; padding:2.5rem;">
                  <i class="pi pi-money-bill" style="font-size: 2rem; display: block; margin-bottom: 0.5rem; color: var(--pq-slate-300);"></i>
                  No expenses recorded.
                </td>
              </tr>
            }
          </tbody>
        </table>
      </div>
    </div>

    <!-- Add Expense Modal -->
    @if (dialogVisible) {
      <div class="pq-modal-backdrop" (click)="dialogVisible = false">
        <div class="pq-modal" (click)="$event.stopPropagation()">
          <div class="pq-modal-header">
            <h3>Add Expense</h3>
            <button class="pq-modal-close" (click)="dialogVisible = false">&times;</button>
          </div>
          <div class="pq-modal-body">
            @if (active) {
              @let a = active;
              <div class="dialog-body">
                <label class="field"><span>Category</span>
                  <select class="pq-select" [(ngModel)]="a.category">
                    @for (opt of categoryOptions; track opt.value) {
                      <option [value]="opt.value">{{ opt.label }}</option>
                    }
                  </select>
                </label>
                <label class="field"><span>Description</span>
                  <textarea class="pq-textarea" [(ngModel)]="a.description" rows="3"
                            placeholder="Optional notes"></textarea></label>
                <div class="row">
                  <label class="field"><span>Amount ($)</span>
                    <input type="number" class="pq-input" [(ngModel)]="a.amount" step="0.01" /></label>
                  <label class="field"><span>Incurred On</span>
                    <input type="date" class="pq-input" [(ngModel)]="a.incurred_on" /></label>
                </div>
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
  `,
  styles: [
    `
      .actions { display: flex; gap: 0.25rem; }
      .dialog-body { display: flex; flex-direction: column; gap: 0.85rem; }
      .row { display: flex; gap: 0.75rem; }
      .row > label { flex: 1; }
      .field { display: flex; flex-direction: column; gap: 0.35rem; }
      .field span { font-size: 0.82rem; color: var(--pq-slate-600); font-weight: 500; }
    `,
  ],
})
export class ExpensesComponent implements OnInit, OnDestroy {
  private api = inject(ApiService);
  private auth = inject(AuthService);
  private realtime = inject(LabRealtimeService);
  private toast = inject(ToastService);
  private platformId = inject(PLATFORM_ID);
  private isBrowser = isPlatformBrowser(this.platformId);

  private sub?: Subscription;

  readonly expenses = signal<LabExpense[]>([]);
  loading = false;

  readonly categoryOptions = [
    { label: 'Salaries', value: 'Salaries' },
    { label: 'Reagents', value: 'Reagents' },
    { label: 'Utilities', value: 'Utilities' },
    { label: 'Maintenance', value: 'Maintenance' },
    { label: 'Rent', value: 'Rent' },
    { label: 'Misc', value: 'Misc' },
  ];

  dialogVisible = false;
  active: ExpenseForm | null = null;

  ngOnInit(): void {
    if (!this.isBrowser) return;

    this.load();

    const user = this.auth.user();
    if (user?.hospital_id) {
      const room = `hospital_${user.hospital_id}`;
      this.sub = this.realtime.connect(room).subscribe((msg) => {
        if (msg && msg.type === 'lab_expense_updated') {
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
    this.api.listExpenses().subscribe({
      next: (rows) => {
        this.expenses.set(rows);
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
    this.active = { category: 'Reagents', description: null, amount: 0, incurred_on: null };
    this.dialogVisible = true;
  }

  save(): void {
    if (!this.active) return;
    this.api
      .createExpense({
        category: this.active.category,
        description: this.active.description || null,
        amount: this.active.amount,
        incurred_on: this.active.incurred_on || null,
      })
      .subscribe({
        next: () => {
          this.toast.add({ severity: 'success', summary: 'Saved', detail: this.active!.category });
          this.dialogVisible = false;
        },
        error: (e) =>
          this.toast.add({ severity: 'error', summary: 'Error', detail: e?.error?.detail || 'Failed' }),
      });
  }

  remove(r: LabExpense): void {
    this.api.deleteExpense(r.id).subscribe({
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
