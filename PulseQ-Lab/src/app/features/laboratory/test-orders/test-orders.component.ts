import { Component, inject, OnDestroy, OnInit, PLATFORM_ID, signal } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { Subscription } from 'rxjs';

import { ApiService } from '../../../core/api.service';
import { AuthService } from '../../../core/auth.service';
import { LabRealtimeService } from '../../../core/services/realtime.service';
import { ToastService } from '../../../core/toast.service';
import { LabTestCatalog, LabTestOrder } from '../../../core/models/laboratory.models';
import { laboratoryPath } from '../../../shared/utils/portal-path.util';
import { prioritySeverity, statusLabel, statusSeverity } from '../../../shared/utils/status.util';

@Component({
  selector: 'app-test-orders',
  standalone: true,
  imports: [FormsModule],
  template: `
    <div class="pq-page">
      <div class="pq-page-header">
        <div><h1>Test Orders</h1><p>All lab orders across their lifecycle</p></div>
        <button class="pq-btn pq-btn-primary" (click)="openCreateOrder()"><i class="pi pi-plus"></i> New Order</button>
      </div>

      <div class="pq-card filters">
        <input class="pq-input search-input" [(ngModel)]="fPatient" (ngModelChange)="reload()" placeholder="Search patient…" />
        
        <select class="pq-select filter-select" [(ngModel)]="fStatus" (change)="reload()">
          <option [value]="null">All Statuses</option>
          @for (opt of statusOptions; track opt.value) {
            <option [value]="opt.value">{{ opt.label }}</option>
          }
        </select>

        <select class="pq-select filter-select" [(ngModel)]="fPriority" (change)="reload()">
          <option [value]="null">All Priorities</option>
          @for (opt of priorityOptions; track opt.value) {
            <option [value]="opt.value">{{ opt.label }}</option>
          }
        </select>

        <select class="pq-select filter-select" [(ngModel)]="fSource" (change)="reload()">
          <option [value]="null">All Sources</option>
          @for (opt of sourceOptions; track opt.value) {
            <option [value]="opt.value">{{ opt.label }}</option>
          }
        </select>

        <input type="date" class="pq-input date-input" [(ngModel)]="fDate" (ngModelChange)="reload()" />
      </div>

      <div class="pq-table-container">
        <table class="pq-table">
          <thead>
            <tr>
              <th>Order ID</th>
              <th>Patient</th>
              <th>Tests</th>
              <th>Doctor</th>
              <th>Priority</th>
              <th>Status</th>
              <th>Collected</th>
              <th style="width:200px; text-align:right;">Actions</th>
            </tr>
          </thead>
          <tbody>
            @for (o of orders(); track o.id) {
              <tr>
                <td class="mono">{{ shortId(o.id) }}</td>
                <td style="font-weight: 600; color: var(--pq-slate-900);">
                  {{ o.patient_name }}
                  <br />
                  <span class="pq-muted" style="font-size: 0.8rem; font-weight: normal;">
                    {{ o.patient_age }}y / {{ o.patient_gender }}
                  </span>
                </td>
                <td>{{ testsSummary(o) }}</td>
                <td>{{ o.ordering_doctor_name || 'Walk-in' }}</td>
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
                <td>{{ o.collected_at ? 'Yes' : '—' }}</td>
                <td style="text-align:right;">
                  <div class="actions" style="justify-content: flex-end;">
                    @if (o.status === 'ordered') {
                      <button class="pq-btn pq-btn-text" (click)="openCollect(o)" title="Collect Sample">
                        <i class="pi pi-box"></i>
                      </button>
                    }
                    @if (!isTerminal(o.status)) {
                      <button class="pq-btn pq-btn-text" (click)="advance(o)" title="Advance Status">
                        <i class="pi pi-arrow-right"></i>
                      </button>
                      <button class="pq-btn pq-btn-text-danger" (click)="cancel(o)" title="Cancel Order">
                        <i class="pi pi-times"></i>
                      </button>
                    }
                    <button class="pq-btn pq-btn-text" (click)="openDetails(o)" title="View Details">
                      <i class="pi pi-eye"></i>
                    </button>
                  </div>
                </td>
              </tr>
            } @empty {
              <tr>
                <td colspan="8" class="pq-muted" style="text-align: center; padding: 2rem;">No test orders found.</td>
              </tr>
            }
          </tbody>
        </table>
      </div>
    </div>

    <!-- Create New Order Modal -->
    @if (createVisible) {
      <div class="pq-modal-backdrop" (click)="createVisible = false">
        <div class="pq-modal" style="max-width: 640px;" (click)="$event.stopPropagation()">
          <div class="pq-modal-header">
            <h3>Create New Test Order</h3>
            <button class="pq-modal-close" (click)="createVisible = false">&times;</button>
          </div>
          <div class="pq-modal-body">
            <div class="dialog-body">
              <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 0.85rem;">
                <label class="field"><span>Patient ID</span>
                  <input class="pq-input" [(ngModel)]="newPatientId" placeholder="e.g. PAT-1001" /></label>
                <label class="field"><span>Patient Name *</span>
                  <input class="pq-input" [(ngModel)]="newPatientName" placeholder="Full patient name" /></label>
              </div>

              <div style="display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 0.85rem;">
                <label class="field"><span>Age</span>
                  <input type="number" class="pq-input" [(ngModel)]="newPatientAge" placeholder="Age" /></label>
                <label class="field"><span>Gender</span>
                  <select class="pq-select" [(ngModel)]="newPatientGender">
                    <option value="Male">Male</option>
                    <option value="Female">Female</option>
                    <option value="Other">Other</option>
                  </select>
                </label>
                <label class="field"><span>Priority</span>
                  <select class="pq-select" [(ngModel)]="newPriority">
                    <option value="routine">Routine</option>
                    <option value="urgent">Urgent</option>
                    <option value="stat">Stat</option>
                  </select>
                </label>
              </div>

              <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 0.85rem;">
                <label class="field"><span>Ordering Doctor</span>
                  <input class="pq-input" [(ngModel)]="newDoctorName" placeholder="Dr. Name or Walk-in" /></label>
                <label class="field"><span>Source</span>
                  <select class="pq-select" [(ngModel)]="newSource">
                    <option value="internal">Internal</option>
                    <option value="referred">Referred</option>
                  </select>
                </label>
              </div>

              <div class="field">
                <span>Select Tests *</span>
                @if (catalogLoading) {
                  <p class="pq-muted" style="margin: 0.5rem 0;">Loading test catalog...</p>
                } @else {
                  <div class="test-selection-list" style="max-height: 180px; overflow-y: auto; border: 1px solid var(--pq-border); border-radius: 6px; padding: 0.5rem;">
                    @for (t of catalogList; track t.id) {
                      <label style="display: flex; align-items: center; justify-content: space-between; padding: 0.4rem 0.5rem; border-bottom: 1px solid var(--pq-slate-100); cursor: pointer;">
                        <div style="display: flex; align-items: center; gap: 0.5rem;">
                          <input type="checkbox" [checked]="isTestSelected(t.id)" (change)="toggleTestSelection(t.id)" />
                          <span style="font-weight: 500; font-size: 0.9rem;">{{ t.name }}</span>
                          <span class="pq-muted" style="font-size: 0.8rem;">({{ t.code }})</span>
                        </div>
                        <span style="font-weight: 600; font-size: 0.85rem; color: var(--pq-blue-600);">\${{ t.price }}</span>
                      </label>
                    } @empty {
                      <p class="pq-muted" style="margin: 0.5rem 0;">No active tests available in catalog.</p>
                    }
                  </div>
                }
              </div>

              <label class="field"><span>Notes</span>
                <textarea class="pq-input" [(ngModel)]="newNotes" rows="2" placeholder="Clinical notes or special instructions..."></textarea></label>
            </div>
          </div>
          <div class="pq-modal-footer">
            <button class="pq-btn pq-btn-outline" (click)="createVisible = false">Cancel</button>
            <button class="pq-btn pq-btn-primary" (click)="submitCreateOrder()" [disabled]="submittingOrder">
              {{ submittingOrder ? 'Creating...' : 'Create Order' }}
            </button>
          </div>
        </div>
      </div>
    }

    <!-- Collect Sample Modal -->
    @if (collectVisible) {
      <div class="pq-modal-backdrop" (click)="collectVisible = false">
        <div class="pq-modal" (click)="$event.stopPropagation()">
          <div class="pq-modal-header">
            <h3>Collect Sample</h3>
            <button class="pq-modal-close" (click)="collectVisible = false">&times;</button>
          </div>
          <div class="pq-modal-body">
            @if (activeOrder) {
              <div class="dialog-body">
                <p class="pq-muted" style="margin-top:0;">{{ activeOrder.patient_name }} — {{ testsSummary(activeOrder) }}</p>
                <label class="field"><span>Barcode</span>
                  <input class="pq-input" [(ngModel)]="barcode" placeholder="e.g. BC-0001" /></label>
                <label class="field"><span>Collected By</span>
                  <input class="pq-input" [(ngModel)]="collectedBy" placeholder="Phlebotomist name" /></label>
              </div>
            }
          </div>
          <div class="pq-modal-footer">
            <button class="pq-btn pq-btn-outline" (click)="collectVisible = false">Cancel</button>
            <button class="pq-btn pq-btn-primary" (click)="doCollect()">Mark Collected</button>
          </div>
        </div>
      </div>
    }

    <!-- Order Details Modal -->
    @if (detailsVisible) {
      <div class="pq-modal-backdrop" (click)="detailsVisible = false">
        <div class="pq-modal" style="max-width: 560px;" (click)="$event.stopPropagation()">
          <div class="pq-modal-header">
            <h3>Order Details</h3>
            <button class="pq-modal-close" (click)="detailsVisible = false">&times;</button>
          </div>
          <div class="pq-modal-body">
            @if (activeOrder) {
              <div class="dialog-body">
                <div class="kv"><span>Patient</span><b>{{ activeOrder.patient_name }}</b></div>
                <div class="kv"><span>Status</span>
                  <span class="pq-badge" [class]="'pq-badge-' + statusSeverity(activeOrder.status)">
                    {{ statusLabel(activeOrder.status) }}
                  </span>
                </div>
                <div class="kv"><span>Priority</span><b>{{ activeOrder.priority }}</b></div>
                <div class="kv"><span>Doctor</span><b>{{ activeOrder.ordering_doctor_name || 'Walk-in' }}</b></div>
                <div class="kv"><span>Barcode</span><b>{{ activeOrder.sample_barcode || '—' }}</b></div>
                <div class="kv"><span>Source</span><b>{{ activeOrder.source }}</b></div>
                
                <h4 style="margin: 1.25rem 0 0.5rem; font-weight: 700; font-size: 0.95rem;">Tests</h4>
                <ul class="test-list">
                  @for (t of activeOrder.tests; track t.id) {
                    <li>{{ t.name }} <span class="pq-muted">({{ t.code }})</span></li>
                  }
                </ul>

                @if (activeOrder.results?.length) {
                  <h4 style="margin: 1.25rem 0 0.5rem; font-weight: 700; font-size: 0.95rem;">Results</h4>
                  @for (r of activeOrder.results; track r.id) {
                    <div class="result-line">
                      <span>{{ testName(activeOrder, r.test_id) }}</span>
                      <span class="pq-badge" [class]="r.status === 'verified' ? 'pq-badge-success' : 'pq-badge-warn'">
                        {{ r.status }}
                      </span>
                    </div>
                  }
                }
              </div>
            }
          </div>
          <div class="pq-modal-footer">
            <button class="pq-btn pq-btn-primary" (click)="detailsVisible = false">Close</button>
          </div>
        </div>
      </div>
    }
  `,
  styles: [
    `
      .filters {
        display: flex;
        gap: 0.75rem;
        flex-wrap: wrap;
        align-items: center;
      }
      .search-input {
        flex: 1.5;
        min-width: 200px;
      }
      .filter-select {
        flex: 1;
        min-width: 140px;
      }
      .date-input {
        flex: 1;
        min-width: 140px;
      }
      .actions { display: flex; gap: 0.25rem; }
      .mono { font-family: ui-monospace, monospace; font-size: 0.8rem; color: var(--pq-slate-500); }
      .dialog-body { display: flex; flex-direction: column; gap: 0.85rem; }
      .field { display: flex; flex-direction: column; gap: 0.35rem; }
      .field span { font-size: 0.82rem; color: var(--pq-slate-600); font-weight: 500; }
      .kv { display: flex; justify-content: space-between; align-items: center; padding: 0.5rem 0; border-bottom: 1px solid var(--pq-border); }
      .kv span { color: var(--pq-slate-500); font-size: 0.9rem; }
      .kv b { color: var(--pq-slate-800); }
      .test-list, .result-line { margin: 0; padding: 0; list-style: none; }
      .test-list li { padding: 0.4rem 0; border-bottom: 1px solid var(--pq-border); font-size: 0.9rem; }
      .test-list li:last-child { border-bottom: none; }
      .result-line { display: flex; justify-content: space-between; align-items: center; padding: 0.5rem 0; border-bottom: 1px solid var(--pq-border); font-size: 0.9rem; }
      .result-line:last-child { border-bottom: none; }
    `,
  ],
})
export class TestOrdersComponent implements OnInit, OnDestroy {
  private api = inject(ApiService);
  private auth = inject(AuthService);
  private realtime = inject(LabRealtimeService);
  private toast = inject(ToastService);
  private router = inject(Router);
  private route = inject(ActivatedRoute);
  private platformId = inject(PLATFORM_ID);
  private isBrowser = isPlatformBrowser(this.platformId);

  private sub?: Subscription;

  readonly orders = signal<LabTestOrder[]>([]);
  loading = false;

  // filters
  fPatient = '';
  fStatus: string | null = null;
  fPriority: string | null = null;
  fSource: string | null = null;
  fDate = '';

  readonly statusOptions = [
    { label: 'Ordered', value: 'ordered' },
    { label: 'Sample Collected', value: 'sample_collected' },
    { label: 'Processing', value: 'processing' },
    { label: 'Completed', value: 'completed' },
    { label: 'Reported', value: 'reported' },
    { label: 'Cancelled', value: 'cancelled' },
  ];
  readonly priorityOptions = [
    { label: 'Routine', value: 'routine' },
    { label: 'Urgent', value: 'urgent' },
    { label: 'Stat', value: 'stat' },
  ];
  readonly sourceOptions = [
    { label: 'Internal', value: 'internal' },
    { label: 'Referred', value: 'referred' },
  ];

  // dialogs
  createVisible = false;
  catalogLoading = false;
  submittingOrder = false;
  catalogList: LabTestCatalog[] = [];
  selectedTestIds: string[] = [];

  newPatientId = '';
  newPatientName = '';
  newPatientAge: number | null = 30;
  newPatientGender = 'Male';
  newDoctorName = '';
  newPriority = 'routine';
  newSource = 'internal';
  newNotes = '';

  collectVisible = false;
  detailsVisible = false;
  activeOrder: LabTestOrder | null = null;
  barcode = '';
  collectedBy = '';

  ngOnInit(): void {
    if (!this.isBrowser) return;

    this.reload();

    this.route.queryParams.subscribe((queryParams) => {
      if (queryParams['create'] === 'true') {
        this.openCreateOrder();
      }
    });

    const user = this.auth.user();
    if (user?.hospital_id) {
      const room = `hospital_${user.hospital_id}`;
      this.sub = this.realtime.connect(room).subscribe((msg) => {
        if (msg && (msg.type === 'lab_queue_update' || msg.type === 'lab_order_created' || msg.type === 'lab_order_updated')) {
          const orderId = msg.order_id || msg.data?.order_id;
          const newStatus = msg.status || msg.data?.status;

          if (orderId && newStatus) {
            const current = this.orders();
            const idx = current.findIndex((o) => o.id === orderId);
            if (idx >= 0) {
              const updated = [...current];
              updated[idx] = { ...updated[idx], status: newStatus };
              this.orders.set(updated);
              return;
            }
          }
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
    this.api
      .listOrders({
        status: this.fStatus,
        priority: this.fPriority,
        source: this.fSource,
        date: this.fDate || null,
        patient: this.fPatient || null,
      })
      .subscribe({
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

  createOrder(): void {
    this.openCreateOrder();
  }

  openCreateOrder(): void {
    this.newPatientId = `PAT-${Math.floor(1000 + Math.random() * 9000)}`;
    this.newPatientName = '';
    this.newPatientAge = 30;
    this.newPatientGender = 'Male';
    this.newDoctorName = '';
    this.newPriority = 'routine';
    this.newSource = 'internal';
    this.newNotes = '';
    this.selectedTestIds = [];
    this.createVisible = true;

    this.catalogLoading = true;
    this.api.listCatalog().subscribe({
      next: (list) => {
        this.catalogList = list || [];
        this.catalogLoading = false;
      },
      error: () => {
        this.catalogLoading = false;
        this.toast.add({ severity: 'error', summary: 'Error', detail: 'Could not load test catalog' });
      },
    });
  }

  toggleTestSelection(testId: string): void {
    const idx = this.selectedTestIds.indexOf(testId);
    if (idx >= 0) {
      this.selectedTestIds.splice(idx, 1);
    } else {
      this.selectedTestIds.push(testId);
    }
  }

  isTestSelected(testId: string): boolean {
    return this.selectedTestIds.includes(testId);
  }

  submitCreateOrder(): void {
    if (!this.newPatientName.trim()) {
      this.toast.add({ severity: 'warn', detail: 'Patient name is required' });
      return;
    }
    if (this.selectedTestIds.length === 0) {
      this.toast.add({ severity: 'warn', detail: 'Please select at least one test' });
      return;
    }

    this.submittingOrder = true;
    const payload = {
      patient_id: this.newPatientId.trim() || `PAT-${Date.now()}`,
      patient_name: this.newPatientName.trim(),
      patient_age: this.newPatientAge,
      patient_gender: this.newPatientGender,
      ordering_doctor_name: this.newDoctorName.trim() || 'Walk-in',
      test_ids: this.selectedTestIds,
      priority: this.newPriority,
      source: this.newSource,
      notes: this.newNotes.trim() || null,
    };

    this.api.createOrder(payload).subscribe({
      next: (order) => {
        this.submittingOrder = false;
        this.createVisible = false;
        this.toast.add({ severity: 'success', summary: 'Created', detail: `Order ${short(order.id)} created successfully` });
        this.reload();
      },
      error: (e) => {
        this.submittingOrder = false;
        this.toast.add({ severity: 'error', summary: 'Failed', detail: e?.error?.detail || 'Could not create order' });
      },
    });
  }

  isTerminal(status: string): boolean {
    return status === 'reported' || status === 'cancelled';
  }

  advance(o: LabTestOrder): void {
    this.api.advanceOrder(o.id).subscribe({
      next: () => {
        this.toast.add({ severity: 'success', summary: 'Advanced', detail: `${short(o.id)} moved forward` });
      },
      error: (e) => this.toast.add({ severity: 'error', detail: e?.error?.detail || 'Failed' }),
    });
  }

  cancel(o: LabTestOrder): void {
    this.api.cancelOrder(o.id).subscribe({
      next: () => {
        this.toast.add({ severity: 'warn', summary: 'Cancelled', detail: short(o.id) });
      },
      error: (e) => this.toast.add({ severity: 'error', detail: e?.error?.detail || 'Failed' }),
    });
  }

  openCollect(o: LabTestOrder): void {
    this.activeOrder = o;
    this.barcode = '';
    this.collectedBy = '';
    this.collectVisible = true;
  }

  doCollect(): void {
    if (!this.activeOrder || !this.barcode || !this.collectedBy) {
      this.toast.add({ severity: 'warn', detail: 'Barcode and collector are required' });
      return;
    }
    this.api.collectSample(this.activeOrder.id, { sample_barcode: this.barcode, collected_by: this.collectedBy }).subscribe({
      next: () => {
        this.toast.add({ severity: 'success', summary: 'Collected', detail: short(this.activeOrder!.id) });
        this.collectVisible = false;
      },
      error: (e) => this.toast.add({ severity: 'error', detail: e?.error?.detail || 'Failed' }),
    });
  }

  openDetails(o: LabTestOrder): void {
    this.activeOrder = o;
    this.detailsVisible = true;
  }

  testName(o: LabTestOrder, testId: string): string {
    return o.tests?.find((t) => t.id === testId)?.name || testId;
  }

  testsSummary(o: LabTestOrder): string {
    return (o.tests || []).map((t) => t.name).join(', ') || `${o.test_ids?.length ?? 0} test(s)`;
  }

  shortId(id: string): string {
    return id.slice(0, 8);
  }

  protected readonly prioritySeverity = prioritySeverity;
  protected readonly statusSeverity = statusSeverity;
  protected readonly statusLabel = statusLabel;
}

function short(id: string): string {
  return id.slice(0, 8);
}
