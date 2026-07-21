import { Component, inject, OnDestroy, OnInit, PLATFORM_ID, signal } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Subscription } from 'rxjs';

import { ApiService } from '../../../core/api.service';
import { AuthService } from '../../../core/auth.service';
import { LabRealtimeService } from '../../../core/services/realtime.service';
import { ToastService } from '../../../core/toast.service';
import { LabTestCatalog, RefRange } from '../../../core/models/laboratory.models';

interface CatalogForm {
  name: string;
  code: string;
  category: string;
  sample_type: string;
  price: number;
  turnaround_hours: number;
  reference_ranges: string;
}

@Component({
  selector: 'app-test-catalog',
  standalone: true,
  imports: [FormsModule],
  template: `
    <div class="pq-page">
      <div class="pq-page-header">
        <div><h1>Test Catalog</h1><p>Manage available laboratory tests</p></div>
        <button class="pq-btn pq-btn-primary" (click)="openNew()"><i class="pi pi-plus"></i> Add Test</button>
      </div>

      <div class="pq-card filters">
        <label class="chk">
          <input type="checkbox" [checked]="includeInactive()" (change)="onToggleInactive($event)" />
          <span>Show inactive tests</span>
        </label>
      </div>

      <div class="pq-table-container">
        <table class="pq-table">
          <thead>
            <tr>
              <th>Name</th><th>Code</th><th>Category</th><th>Sample</th>
              <th>Price</th><th>Turnaround (h)</th><th>Status</th><th style="width:160px; text-align:right;">Actions</th>
            </tr>
          </thead>
          <tbody>
            @for (r of catalog(); track r.id) {
              <tr>
                <td style="font-weight: 600; color: var(--pq-slate-900);">{{ r.name }}</td>
                <td class="mono">{{ r.code }}</td>
                <td style="text-transform: capitalize;">{{ r.category }}</td>
                <td style="text-transform: capitalize;">{{ r.sample_type }}</td>
                <td>{{ money(r.price) }}</td>
                <td>{{ r.turnaround_hours }}</td>
                <td>
                  @if (r.is_active) {
                    <span class="pq-badge pq-badge-success">Active</span>
                  } @else {
                    <span class="pq-badge pq-badge-info" style="background:#e2e8f0; color:#475569;">Inactive</span>
                  }
                </td>
                <td style="text-align:right;">
                  <div class="actions" style="justify-content: flex-end;">
                    @if (r.is_active) {
                      <button class="pq-btn pq-btn-text" (click)="openEdit(r)" title="Edit Test"><i class="pi pi-pencil"></i></button>
                      <button class="pq-btn pq-btn-text" (click)="deactivate(r)" title="Deactivate Test"><i class="pi pi-eye-slash"></i></button>
                    }
                    <button class="pq-btn pq-btn-text-danger" (click)="remove(r)" title="Delete Test"><i class="pi pi-trash"></i></button>
                  </div>
                </td>
              </tr>
            } @empty {
              <tr>
                <td colspan="8" class="pq-muted" style="text-align:center; padding: 2.5rem;">
                  <i class="pi pi-list" style="font-size: 2rem; display: block; margin-bottom: 0.5rem; color: var(--pq-slate-300);"></i>
                  No tests found.
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
            <h3>{{ editingId ? 'Edit Test' : 'Add Test' }}</h3>
            <button class="pq-modal-close" (click)="dialogVisible = false">&times;</button>
          </div>
          <div class="pq-modal-body">
            @if (active) {
              @let a = active;
              <div class="dialog-body">
                <label class="field"><span>Name</span>
                  <input class="pq-input" [(ngModel)]="a.name" placeholder="e.g. CBC" /></label>
                <label class="field"><span>Code</span>
                  <input class="pq-input" [(ngModel)]="a.code" placeholder="e.g. HEM-CBC" /></label>
                
                <div class="row">
                  <label class="field"><span>Category</span>
                    <select class="pq-select" [(ngModel)]="a.category">
                      @for (c of categories; track c.value) {
                        <option [value]="c.value">{{ c.label }}</option>
                      }
                    </select></label>
                  <label class="field"><span>Sample Type</span>
                    <input class="pq-input" [(ngModel)]="a.sample_type" placeholder="e.g. blood, urine" /></label>
                </div>

                <div class="row">
                  <label class="field"><span>Price</span>
                    <input type="number" class="pq-input" [(ngModel)]="a.price" /></label>
                  <label class="field"><span>Turnaround (hours)</span>
                    <input type="number" class="pq-input" [(ngModel)]="a.turnaround_hours" /></label>
                </div>

                <label class="field"><span>Reference Ranges (JSON array)</span>
                  <textarea class="pq-input" rows="4" [(ngModel)]="a.reference_ranges"
                            placeholder='[{"param":"WBC","unit":"/uL","low":4000,"high":11000}]'></textarea></label>
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
      .filters { display: flex; align-items: center; justify-content: space-between; }
      .chk { display: flex; align-items: center; gap: 0.5rem; font-size: 0.9rem; cursor: pointer; color: var(--pq-slate-700); }
      .mono { font-family: ui-monospace, monospace; font-size: 0.8rem; color: var(--pq-slate-500); }
      .actions { display: flex; gap: 0.25rem; }
      .dialog-body { display: flex; flex-direction: column; gap: 0.85rem; }
      .row { display: flex; gap: 0.75rem; }
      .row > label { flex: 1; }
      .field { display: flex; flex-direction: column; gap: 0.35rem; }
      .field span { font-size: 0.82rem; color: var(--pq-slate-600); font-weight: 500; }
    `,
  ],
})
export class TestCatalogComponent implements OnInit, OnDestroy {
  private api = inject(ApiService);
  private auth = inject(AuthService);
  private realtime = inject(LabRealtimeService);
  private toast = inject(ToastService);
  private platformId = inject(PLATFORM_ID);
  private isBrowser = isPlatformBrowser(this.platformId);

  private sub?: Subscription;

  readonly catalog = signal<LabTestCatalog[]>([]);
  readonly includeInactive = signal(false);
  loading = false;

  readonly categories = [
    { label: 'Hematology', value: 'hematology' },
    { label: 'Biochemistry', value: 'biochemistry' },
    { label: 'Microbiology', value: 'microbiology' },
    { label: 'Serology', value: 'serology' },
    { label: 'Histopathology', value: 'histopathology' },
    { label: 'Radiology', value: 'radiology' },
  ];

  dialogVisible = false;
  editingId: string | null = null;
  active: CatalogForm | null = null;

  ngOnInit(): void {
    if (!this.isBrowser) return;

    this.load();

    const user = this.auth.user();
    if (user?.hospital_id) {
      const room = `hospital_${user.hospital_id}`;
      this.sub = this.realtime.connect(room).subscribe((msg) => {
        if (msg && msg.type === 'lab_catalog_updated') {
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
    this.api.listCatalog(this.includeInactive()).subscribe({
      next: (rows) => {
        this.catalog.set(rows);
        this.loading = false;
      },
      error: (e) => {
        this.loading = false;
        this.toast.add({ severity: 'error', summary: 'Error', detail: e?.error?.detail || 'Failed' });
      },
    });
  }

  onToggleInactive(e: Event): void {
    const checked = (e.target as HTMLInputElement).checked;
    this.includeInactive.set(checked);
    this.load();
  }

  private blankForm(): CatalogForm {
    return {
      name: '',
      code: '',
      category: 'hematology',
      sample_type: '',
      price: 0,
      turnaround_hours: 24,
      reference_ranges: '',
    };
  }

  openNew(): void {
    this.editingId = null;
    this.active = this.blankForm();
    this.dialogVisible = true;
  }

  openEdit(r: LabTestCatalog): void {
    this.editingId = r.id;
    this.active = {
      name: r.name,
      code: r.code,
      category: r.category,
      sample_type: r.sample_type,
      price: r.price,
      turnaround_hours: r.turnaround_hours,
      reference_ranges: r.reference_ranges?.length
        ? JSON.stringify(r.reference_ranges, null, 2)
        : '',
    };
    this.dialogVisible = true;
  }

  private parseRanges(raw: string): RefRange[] {
    if (!raw || !raw.trim()) return [];
    try {
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? (parsed as RefRange[]) : [];
    } catch {
      return [];
    }
  }

  save(): void {
    if (!this.active) return;
    const payload: Partial<LabTestCatalog> = {
      name: this.active.name,
      code: this.active.code,
      category: this.active.category,
      sample_type: this.active.sample_type,
      price: this.active.price,
      turnaround_hours: this.active.turnaround_hours,
      reference_ranges: this.parseRanges(this.active.reference_ranges),
    };
    const req$ = this.editingId
      ? this.api.updateCatalog(this.editingId, payload)
      : this.api.createCatalog(payload);
    req$.subscribe({
      next: () => {
        this.toast.add({
          severity: 'success',
          summary: 'Saved',
          detail: this.active!.name || 'Test',
        });
        this.dialogVisible = false;
      },
      error: (e) =>
        this.toast.add({ severity: 'error', summary: 'Error', detail: e?.error?.detail || 'Failed' }),
    });
  }

  deactivate(r: LabTestCatalog): void {
    this.api.updateCatalog(r.id, { is_active: false }).subscribe({
      next: () => {
        this.toast.add({ severity: 'success', summary: 'Deactivated', detail: short(r.id) });
      },
      error: (e) =>
        this.toast.add({ severity: 'error', summary: 'Error', detail: e?.error?.detail || 'Failed' }),
    });
  }

  remove(r: LabTestCatalog): void {
    this.api.deleteCatalog(r.id).subscribe({
      next: () => {
        this.toast.add({ severity: 'success', summary: 'Deleted', detail: short(r.id) });
      },
      error: (e) =>
        this.toast.add({ severity: 'error', summary: 'Error', detail: e?.error?.detail || 'Failed' }),
    });
  }

  money(n: number): string {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
    }).format(n || 0);
  }
}

function short(id: string): string {
  return id.slice(0, 8);
}
