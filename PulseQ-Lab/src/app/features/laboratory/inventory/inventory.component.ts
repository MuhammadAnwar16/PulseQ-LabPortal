import { Component, inject, OnDestroy, OnInit, PLATFORM_ID, signal } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Subscription } from 'rxjs';

import { ApiService } from '../../../core/api.service';
import { AuthService } from '../../../core/auth.service';
import { LabRealtimeService } from '../../../core/services/realtime.service';
import { ToastService } from '../../../core/toast.service';
import { LabInventory } from '../../../core/models/laboratory.models';

interface InventoryForm {
  name: string;
  sku: string;
  quantity: number;
  reorder_level: number;
  expiry_date: string | null;
  unit_cost: number;
  category: string | null;
}

@Component({
  selector: 'app-inventory',
  standalone: true,
  imports: [FormsModule],
  template: `
    <div class="pq-page">
      <div class="pq-page-header">
        <div><h1>Inventory</h1><p>Track reagents, kits and consumables</p></div>
        <button class="pq-btn pq-btn-primary" (click)="openNew()"><i class="pi pi-plus"></i> Add Item</button>
      </div>

      <div class="pq-table-container">
        <table class="pq-table">
          <thead>
            <tr>
              <th>Name</th><th>SKU</th><th>Qty</th><th>Reorder</th>
              <th>Expiry</th><th>Unit Cost</th><th>Category</th><th>Status</th>
              <th style="width:120px; text-align:right;">Actions</th>
            </tr>
          </thead>
          <tbody>
            @for (r of items(); track r.id) {
              <tr>
                <td style="font-weight: 600; color: var(--pq-slate-900);">{{ r.name }}</td>
                <td class="mono">{{ r.sku }}</td>
                <td>{{ r.quantity }}</td>
                <td>{{ r.reorder_level }}</td>
                <td>{{ r.expiry_date || '—' }}</td>
                <td>{{ money(r.unit_cost) }}</td>
                <td>{{ r.category || '—' }}</td>
                <td>
                  @if (isLow(r)) {
                    <span class="pq-badge pq-badge-warn">Low</span>
                  } @else {
                    <span class="pq-badge pq-badge-success">OK</span>
                  }
                </td>
                <td style="text-align:right;">
                  <div class="actions" style="justify-content: flex-end;">
                    <button class="pq-btn pq-btn-text" (click)="openEdit(r)" title="Edit Item"><i class="pi pi-pencil"></i></button>
                    <button class="pq-btn pq-btn-text-danger" (click)="remove(r)" title="Delete Item"><i class="pi pi-trash"></i></button>
                  </div>
                </td>
              </tr>
            } @empty {
              <tr>
                <td colspan="9" class="pq-muted" style="text-align:center; padding: 2.5rem;">
                  <i class="pi pi-inbox" style="font-size: 2rem; display: block; margin-bottom: 0.5rem; color: var(--pq-slate-300);"></i>
                  No inventory items.
                </td>
              </tr>
            }
          </tbody>
        </table>
      </div>
    </div>

    <!-- Add/Edit Modal Dialog -->
    @if (dialogVisible) {
      <div class="pq-modal-backdrop" (click)="dialogVisible = false">
        <div class="pq-modal" (click)="$event.stopPropagation()">
          <div class="pq-modal-header">
            <h3>{{ editingId ? 'Edit Item' : 'Add Item' }}</h3>
            <button class="pq-modal-close" (click)="dialogVisible = false">&times;</button>
          </div>
          <div class="pq-modal-body">
            @if (active) {
              @let a = active;
              <div class="dialog-body">
                <label class="field"><span>Name</span>
                  <input class="pq-input" [(ngModel)]="a.name" placeholder="e.g. EDTA Tubes" /></label>
                <label class="field"><span>SKU</span>
                  <input class="pq-input" [(ngModel)]="a.sku" placeholder="e.g. EDTA-100" /></label>
                <div class="row">
                  <label class="field"><span>Quantity</span>
                    <input type="number" class="pq-input" [(ngModel)]="a.quantity" /></label>
                  <label class="field"><span>Reorder Level</span>
                    <input type="number" class="pq-input" [(ngModel)]="a.reorder_level" /></label>
                </div>
                <div class="row">
                  <label class="field"><span>Unit Cost ($)</span>
                    <input type="number" class="pq-input" [(ngModel)]="a.unit_cost" step="0.01" /></label>
                  <label class="field"><span>Category</span>
                    <select class="pq-select" [(ngModel)]="a.category">
                      <option [value]="null" disabled selected>Select Category</option>
                      @for (opt of categoryOptions; track opt.value) {
                        <option [value]="opt.value">{{ opt.label }}</option>
                      }
                    </select>
                  </label>
                </div>
                <label class="field"><span>Expiry Date</span>
                  <input type="date" class="pq-input" [(ngModel)]="a.expiry_date" /></label>
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
      .mono { font-family: ui-monospace, monospace; font-size: 0.8rem; color: var(--pq-slate-500); }
      .dialog-body { display: flex; flex-direction: column; gap: 0.85rem; }
      .dialog-body .row { display: flex; gap: 0.75rem; }
      .dialog-body .row .field { flex: 1; }
      .field { display: flex; flex-direction: column; gap: 0.35rem; }
      .field span { font-size: 0.82rem; color: var(--pq-slate-600); font-weight: 500; }
    `,
  ],
})
export class InventoryComponent implements OnInit, OnDestroy {
  private api = inject(ApiService);
  private auth = inject(AuthService);
  private realtime = inject(LabRealtimeService);
  private toast = inject(ToastService);
  private platformId = inject(PLATFORM_ID);
  private isBrowser = isPlatformBrowser(this.platformId);

  private sub?: Subscription;

  readonly items = signal<LabInventory[]>([]);
  loading = false;

  readonly categoryOptions = [
    { label: 'Reagents', value: 'reagents' },
    { label: 'Kits', value: 'kits' },
    { label: 'Consumables', value: 'consumables' },
    { label: 'Equipment', value: 'equipment' },
  ];

  dialogVisible = false;
  editingId: string | null = null;
  active: InventoryForm | null = null;

  ngOnInit(): void {
    if (!this.isBrowser) return;

    this.load();

    const user = this.auth.user();
    if (user?.hospital_id) {
      const room = `hospital_${user.hospital_id}`;
      this.sub = this.realtime.connect(room).subscribe((msg) => {
        if (msg && msg.type === 'lab_inventory_updated') {
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
    this.api.listInventory().subscribe({
      next: (rows) => {
        this.items.set(rows);
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

  isLow(r: LabInventory): boolean {
    return r.quantity <= r.reorder_level;
  }

  private blankForm(): InventoryForm {
    return {
      name: '',
      sku: '',
      quantity: 0,
      reorder_level: 0,
      expiry_date: null,
      unit_cost: 0,
      category: null,
    };
  }

  openNew(): void {
    this.editingId = null;
    this.active = this.blankForm();
    this.dialogVisible = true;
  }

  openEdit(r: LabInventory): void {
    this.editingId = r.id;
    this.active = {
      name: r.name,
      sku: r.sku,
      quantity: r.quantity,
      reorder_level: r.reorder_level,
      expiry_date: r.expiry_date || null,
      unit_cost: r.unit_cost,
      category: r.category || null,
    };
    this.dialogVisible = true;
  }

  save(): void {
    if (!this.active) return;
    const payload: Partial<LabInventory> = {
      name: this.active.name,
      sku: this.active.sku,
      quantity: this.active.quantity,
      reorder_level: this.active.reorder_level,
      expiry_date: this.active.expiry_date || null,
      unit_cost: this.active.unit_cost,
      category: this.active.category || null,
    };
    const req$ = this.editingId
      ? this.api.updateInventory(this.editingId, payload)
      : this.api.createInventory(payload);
    req$.subscribe({
      next: () => {
        this.toast.add({
          severity: 'success',
          summary: 'Saved',
          detail: this.active!.name || 'Item',
        });
        this.dialogVisible = false;
        this.load();
      },
      error: (e) =>
        this.toast.add({ severity: 'error', summary: 'Error', detail: e?.error?.detail || 'Failed' }),
    });
  }

  remove(r: LabInventory): void {
    this.api.deleteInventory(r.id).subscribe({
      next: () => {
        this.toast.add({ severity: 'success', summary: 'Deleted', detail: short(r.id) });
        this.load();
      },
      error: (e) =>
        this.toast.add({ severity: 'error', summary: 'Error', detail: e?.error?.detail || 'Failed' }),
    });
  }
}

function short(id: string): string {
  return id.slice(0, 8);
}
