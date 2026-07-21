import { ChangeDetectionStrategy, Component, inject, OnDestroy, OnInit, PLATFORM_ID, signal } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { Router } from '@angular/router';
import { Subject, Subscription } from 'rxjs';
import { debounceTime } from 'rxjs/operators';

import { ApiService } from '../../../core/api.service';
import { AuthService } from '../../../core/auth.service';
import { LabRealtimeService } from '../../../core/services/realtime.service';
import { ToastService } from '../../../core/toast.service';
import {
  DashboardStats,
  LabInventory,
  LabTestOrder,
} from '../../../core/models/laboratory.models';
import { laboratoryPath } from '../../../shared/utils/portal-path.util';
import { prioritySeverity, statusLabel, statusSeverity } from '../../../shared/utils/status.util';

interface StatCard {
  key: keyof DashboardStats;
  label: string;
  icon: string;
  link?: string;
}

@Component({
  selector: 'app-dashboard',
  standalone: true,
  imports: [],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="pq-page">
      <div class="pq-page-header">
        <div>
          <h1>Laboratory Dashboard</h1>
          <p>Today's workload and live status at a glance</p>
        </div>
        <button class="pq-btn pq-btn-primary" (click)="openNewOrder()"><i class="pi pi-plus"></i> New Order</button>
      </div>

      <div class="pq-grid pq-stat-grid">
        @for (c of cards; track c.key) {
          <div class="stat pq-card" (click)="c.link && go(c.link)" [class.clickable]="c.link" [class]="c.key">
            <div class="stat-header">
              <div class="stat-icon"><i class="pi" [class]="c.icon"></i></div>
              <div class="stat-label">{{ c.label }}</div>
            </div>
            <div class="stat-value">
              @if (c.key === 'revenue_today') {
                Rs. {{ stats()?.[c.key] ?? '—' }}
              } @else {
                {{ stats()?.[c.key] ?? '—' }}
              }
            </div>
          </div>
        }
      </div>

      <div class="dashboard-bottom-grid" style="margin-top:1.5rem">
        <div class="pq-card table-card" style="padding:0; overflow:hidden;">
          <div class="card-header" style="padding: 1.25rem 1.5rem; margin-bottom: 0;">
            <h3>Live Test Queue</h3>
            <span class="badge">Active Work</span>
          </div>
          <div class="pq-table-container" style="border:none; border-radius:0; margin-top:0; box-shadow:none;">
            <table class="pq-table">
              <thead>
                <tr>
                  <th>Patient</th>
                  <th>Tests</th>
                  <th>Prescribing Doctor</th>
                  <th>Priority</th>
                  <th>Status</th>
                  <th>Time</th>
                </tr>
              </thead>
              <tbody>
                @for (o of queue(); track o.id) {
                  <tr (click)="go('orders')" style="cursor:pointer">
                    <td style="font-weight: 600; color: var(--pq-slate-900);">{{ o.patient_name }}</td>
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
                    <td class="pq-muted">{{ shortTime(o.created_at) }}</td>
                  </tr>
                } @empty {
                  <tr>
                    <td colspan="6" class="pq-muted" style="text-align: center; padding: 2.5rem;">
                      <i class="pi pi-check-circle" style="font-size: 2rem; display: block; margin-bottom: 0.5rem; color: var(--pq-success-500);"></i>
                      No active test orders.
                    </td>
                  </tr>
                }
              </tbody>
            </table>
          </div>
        </div>

        <div class="pq-card sidebar-card">
          <div class="card-header" style="margin-bottom: 1.25rem;">
            <h3>Low Reagents Warning</h3>
            @if (lowStock().length) {
              <span class="warning-badge">{{ lowStock().length }} Items</span>
            }
          </div>
          @if (lowStock().length) {
            <ul class="low-list">
              @for (i of lowStock(); track i.id) {
                <li>
                  <div class="reagent-info">
                    <span class="reagent-name">{{ i.name }}</span>
                    <span class="reagent-sku">{{ i.sku }}</span>
                  </div>
                  <div class="reagent-qty">
                    <span class="qty-current">{{ i.quantity }}</span>
                    <span class="qty-max">/ {{ i.reorder_level }} min</span>
                  </div>
                </li>
              }
            </ul>
          } @else {
            <div class="empty-reagents">
              <i class="pi pi-check-circle" style="color: var(--pq-success-500); font-size: 2rem;"></i>
              <p class="pq-muted">All reagents are fully stocked.</p>
            </div>
          }
          <button class="pq-btn pq-btn-outline w-full" (click)="go('inventory')" style="margin-top: 1.5rem;">
            <i class="pi pi-arrow-right"></i> Manage Inventory
          </button>
        </div>
      </div>
    </div>
  `,
  styles: [
    `
      .stat {
        display: flex;
        flex-direction: column;
        gap: 0.75rem;
        border-left: 4px solid var(--pq-slate-200);
      }
      .stat.clickable {
        cursor: pointer;
      }
      .stat.clickable:hover {
        border-color: var(--pq-blue-500);
        transform: translateY(-2px);
      }
      
      /* Accents per card metric type */
      .stat.pending_orders { border-left-color: var(--pq-blue-400); }
      .stat.samples_collected_today { border-left-color: var(--pq-slate-400); }
      .stat.in_processing { border-left-color: var(--pq-amber-500); }
      .stat.completed_today { border-left-color: var(--pq-success-500); }
      .stat.low_stock_reagents { border-left-color: var(--pq-danger-500); }
      .stat.revenue_today { border-left-color: var(--pq-blue-600); }

      .stat-header {
        display: flex;
        align-items: center;
        gap: 0.75rem;
      }
      .stat-icon {
        width: 2.25rem;
        height: 2.25rem;
        border-radius: 8px;
        background: var(--pq-blue-50);
        color: var(--pq-blue-600);
        display: flex;
        align-items: center;
        justify-content: center;
        font-size: 1.05rem;
      }
      .stat.low_stock_reagents .stat-icon {
        background: var(--pq-danger-50);
        color: var(--pq-danger-600);
      }
      .stat.completed_today .stat-icon {
        background: var(--pq-success-50);
        color: var(--pq-success-600);
      }
      .stat.in_processing .stat-icon {
        background: var(--pq-amber-50);
        color: var(--pq-amber-700);
      }

      .stat-value {
        font-size: 1.6rem;
        font-weight: 800;
        color: var(--pq-slate-900);
        letter-spacing: -0.02em;
      }
      .stat-label {
        font-size: 0.85rem;
        font-weight: 600;
        color: var(--pq-slate-500);
      }

      /* Grid layout structure for bottom dashboard cards */
      .dashboard-bottom-grid {
        display: grid;
        grid-template-columns: 2.2fr 1fr;
        gap: 1.5rem;
      }
      .card-header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        margin-bottom: 0.75rem;
      }
      .card-header h3 {
        margin: 0;
        font-size: 1.1rem;
        font-weight: 700;
        color: var(--pq-slate-800);
      }
      .badge {
        background: var(--pq-blue-50);
        color: var(--pq-blue-700);
        font-size: 0.75rem;
        font-weight: 700;
        padding: 0.2rem 0.5rem;
        border-radius: 6px;
      }
      .warning-badge {
        background: var(--pq-danger-50);
        color: var(--pq-danger-600);
        font-size: 0.75rem;
        font-weight: 700;
        padding: 0.2rem 0.5rem;
        border-radius: 6px;
      }

      /* Reagents Warning styling */
      .low-list {
        list-style: none;
        padding: 0;
        margin: 0;
        display: flex;
        flex-direction: column;
        gap: 0.5rem;
      }
      .low-list li {
        display: flex;
        justify-content: space-between;
        align-items: center;
        padding: 0.75rem;
        background: var(--pq-slate-50);
        border: 1px solid var(--pq-border);
        border-radius: 10px;
      }
      .reagent-info {
        display: flex;
        flex-direction: column;
        gap: 0.15rem;
      }
      .reagent-name {
        font-size: 0.88rem;
        font-weight: 600;
        color: var(--pq-slate-800);
      }
      .reagent-sku {
        font-size: 0.75rem;
        color: var(--pq-slate-400);
      }
      .reagent-qty {
        display: flex;
        flex-direction: column;
        align-items: flex-end;
      }
      .qty-current {
        font-size: 0.95rem;
        font-weight: 800;
        color: var(--pq-danger-600);
      }
      .qty-max {
        font-size: 0.72rem;
        color: var(--pq-slate-400);
      }
      .empty-reagents {
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        gap: 0.5rem;
        padding: 2rem 0;
        text-align: center;
      }
      .empty-reagents p {
        margin: 0;
        font-size: 0.88rem;
      }

      .w-full {
        width: 100%;
      }

      @media (max-width: 1024px) {
        .dashboard-bottom-grid {
          grid-template-columns: 1fr;
        }
      }
    `,
  ],
})
export class DashboardComponent implements OnInit, OnDestroy {
  private api = inject(ApiService);
  private auth = inject(AuthService);
  private realtime = inject(LabRealtimeService);
  private toast = inject(ToastService);
  private router = inject(Router);
  private platformId = inject(PLATFORM_ID);
  private isBrowser = isPlatformBrowser(this.platformId);

  private sub?: Subscription;
  private reloadSubject = new Subject<void>();
  private reloadSub?: Subscription;

  readonly stats = signal<DashboardStats | null>(null);
  readonly queue = signal<LabTestOrder[]>([]);
  readonly lowStock = signal<LabInventory[]>([]);

  readonly cards: StatCard[] = [
    { key: 'pending_orders', label: 'Pending Orders', icon: 'pi-inbox', link: 'orders' },
    { key: 'samples_collected_today', label: 'Samples Collected', icon: 'pi-box' },
    { key: 'in_processing', label: 'In Processing', icon: 'pi-spinner' },
    { key: 'completed_today', label: 'Completed Today', icon: 'pi-check-circle' },
    { key: 'low_stock_reagents', label: 'Low-Stock Reagents', icon: 'pi-exclamation-triangle', link: 'inventory' },
    { key: 'revenue_today', label: 'Revenue Today', icon: 'pi-dollar' },
  ];

  ngOnInit(): void {
    if (!this.isBrowser) return;

    this.load();

    // 300ms debounced aggregate metrics loader
    this.reloadSub = this.reloadSubject.pipe(debounceTime(300)).subscribe(() => {
      this.load();
    });

    const user = this.auth.user();
    if (user?.hospital_id) {
      const room = `hospital_${user.hospital_id}`;
      this.sub = this.realtime.connect(room).subscribe((msg) => {
        if (msg && ['lab_queue_update', 'lab_catalog_updated', 'lab_inventory_updated', 'lab_invoice_updated'].includes(msg.type || '')) {
          this.reloadSubject.next();
        }
      });
    }
  }

  ngOnDestroy(): void {
    this.sub?.unsubscribe();
    this.reloadSub?.unsubscribe();
  }

  private load(): void {
    this.api.dashboard().subscribe({
      next: (d) => {
        this.stats.set(d.stats);
        this.queue.set(d.queue);
        this.lowStock.set(d.low_stock);
      },
      error: () => this.toast.add({ severity: 'error', summary: 'Error', detail: 'Could not load dashboard' }),
    });
  }

  testsSummary(o: LabTestOrder): string {
    return (o.tests || []).map((t) => t.name).join(', ') || (o.test_ids?.length ?? 0) + ' test(s)';
  }

  shortTime(iso?: string): string {
    if (!iso) return '—';
    if (iso.includes('-') && iso.length === 10) {
      return iso;
    }
    const d = new Date(iso);
    if (isNaN(d.getTime())) return iso;
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }

  go(sub: string): void {
    this.router.navigate([laboratoryPath(sub)]);
  }

  openNewOrder(): void {
    this.router.navigate([laboratoryPath('orders')], { queryParams: { create: 'true' } });
  }

  protected readonly prioritySeverity = prioritySeverity;
  protected readonly statusSeverity = statusSeverity;
  protected readonly statusLabel = statusLabel;
}

