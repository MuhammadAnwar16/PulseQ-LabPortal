import { Component, signal } from '@angular/core';
import { RouterLink, RouterLinkActive, Router } from '@angular/router';

import { AuthService } from '../../../core/auth.service';
import { laboratoryPath } from '../../utils/portal-path.util';

interface NavItem {
  label: string;
  icon: string;
  path: string;
}

@Component({
  selector: 'app-laboratory-sidebar',
  standalone: true,
  imports: [RouterLink, RouterLinkActive],
  template: `
    <!-- Mobile topbar -->
    <header class="topbar">
      <button class="hamburger" (click)="mobileOpen.set(!mobileOpen())" aria-label="Toggle menu">
        <i class="pi pi-bars"></i>
      </button>
      <span class="brand">PulseQ <b>Laboratory</b></span>
    </header>

    <!-- Overlay (mobile) -->
    @if (mobileOpen()) {
      <div class="overlay" (click)="mobileOpen.set(false)"></div>
    }

    <aside class="sidebar" [class.open]="mobileOpen()">
      <div class="brand-block">
        <i class="pi pi-microscope brand-icon"></i>
        <div>
          <div class="brand">PulseQ</div>
          <div class="brand-sub">Laboratory</div>
        </div>
      </div>

      <nav class="nav">
        @for (item of items; track item.path) {
          <a
            class="nav-item"
            [routerLink]="item.path"
            routerLinkActive="active"
            [routerLinkActiveOptions]="{ exact: false }"
            (click)="mobileOpen.set(false)"
          >
            <i class="pi" [class]="item.icon"></i>
            <span>{{ item.label }}</span>
          </a>
        }
      </nav>

      <div class="signout">
        <div class="user">
          <i class="pi pi-user"></i>
          <div>
            <div class="user-name">{{ auth.user()?.full_name || 'Lab Staff' }}</div>
            <div class="user-role">{{ auth.user()?.role || '' }}</div>
          </div>
        </div>
        <button class="signout-btn" (click)="signOut()">
          <i class="pi pi-sign-out"></i> Sign out
        </button>
      </div>
    </aside>
  `,
  styles: [
    `
      :host {
        display: block;
      }
      .topbar {
        display: none;
        align-items: center;
        gap: 0.75rem;
        padding: 0.75rem 1rem;
        background: var(--pq-surface);
        border-bottom: 1px solid var(--pq-border);
        position: sticky;
        top: 0;
        z-index: 30;
      }
      .hamburger {
        border: 1px solid var(--pq-border);
        background: var(--pq-surface);
        border-radius: 8px;
        padding: 0.4rem 0.6rem;
        cursor: pointer;
        color: var(--pq-slate-700);
      }
      .brand {
        font-size: 1.1rem;
        color: var(--pq-slate-900);
        font-weight: 500;
      }
      .brand b {
        color: var(--pq-blue-600);
      }

      .overlay {
        position: fixed;
        inset: 0;
        background: rgba(17, 24, 39, 0.45);
        z-index: 40;
      }

      .sidebar {
        width: 250px;
        background: var(--pq-surface);
        border-right: 1px solid var(--pq-border);
        min-height: 100vh;
        display: flex;
        flex-direction: column;
        position: sticky;
        top: 0;
      }
      .brand-block {
        display: flex;
        align-items: center;
        gap: 0.65rem;
        padding: 1.25rem 1.25rem 1rem;
        border-bottom: 1px solid var(--pq-border);
      }
      .brand-icon {
        font-size: 1.6rem;
        color: var(--pq-blue-600);
        background: var(--pq-blue-50);
        padding: 0.5rem;
        border-radius: 10px;
      }
      .brand-sub {
        font-size: 0.78rem;
        color: var(--pq-slate-500);
      }
      .nav {
        flex: 1;
        padding: 0.75rem 0.6rem;
        display: flex;
        flex-direction: column;
        gap: 0.15rem;
        overflow-y: auto;
      }
      .nav-item {
        display: flex;
        align-items: center;
        gap: 0.75rem;
        padding: 0.65rem 0.85rem;
        border-radius: 10px;
        color: var(--pq-slate-600);
        font-size: 0.92rem;
        font-weight: 500;
        cursor: pointer;
      }
      .nav-item i {
        font-size: 1rem;
        width: 1.25rem;
        text-align: center;
      }
      .nav-item:hover {
        background: var(--pq-slate-100);
        color: var(--pq-slate-900);
      }
      .nav-item.active {
        background: var(--pq-blue-50);
        color: var(--pq-blue-700);
        font-weight: 600;
      }
      .nav-item.active i {
        color: var(--pq-blue-600);
      }

      .signout {
        border-top: 1px solid var(--pq-border);
        padding: 0.85rem 1rem;
      }
      .user {
        display: flex;
        align-items: center;
        gap: 0.6rem;
        margin-bottom: 0.6rem;
        color: var(--pq-slate-600);
      }
      .user-name {
        font-size: 0.85rem;
        color: var(--pq-slate-800);
        font-weight: 600;
      }
      .user-role {
        font-size: 0.72rem;
        color: var(--pq-slate-400);
        text-transform: capitalize;
      }
      .signout-btn {
        width: 100%;
        display: flex;
        align-items: center;
        justify-content: center;
        gap: 0.5rem;
        border: 1px solid var(--pq-border);
        background: var(--pq-surface);
        color: var(--pq-danger-600);
        padding: 0.5rem;
        border-radius: 8px;
        cursor: pointer;
        font-weight: 500;
      }
      .signout-btn:hover {
        background: #fef2f2;
        border-color: #fecaca;
      }

      @media (max-width: 860px) {
        .topbar {
          display: flex;
        }
        .sidebar {
          position: fixed;
          left: 0;
          top: 0;
          z-index: 50;
          transform: translateX(-100%);
          transition: transform 0.25s ease;
          box-shadow: var(--pq-shadow-md);
        }
        .sidebar.open {
          transform: translateX(0);
        }
      }
    `,
  ],
})
export class LaboratorySidebar {
  readonly mobileOpen = signal(false);

  readonly items: NavItem[] = [
    { label: 'Dashboard', icon: 'pi-chart-line', path: laboratoryPath('dashboard') },
    { label: 'Test Orders', icon: 'pi-clipboard', path: laboratoryPath('orders') },
    { label: 'Sample Collection', icon: 'pi-box', path: laboratoryPath('sample-collection') },
    { label: 'Result Entry', icon: 'pi-pencil', path: laboratoryPath('result-entry') },
    { label: 'Verification', icon: 'pi-check-circle', path: laboratoryPath('verification') },
    { label: 'Reports', icon: 'pi-file-pdf', path: laboratoryPath('reports') },
    { label: 'Test Catalog', icon: 'pi-list', path: laboratoryPath('catalog') },
    { label: 'Inventory', icon: 'pi-inbox', path: laboratoryPath('inventory') },
    { label: 'Billing', icon: 'pi-receipt', path: laboratoryPath('billing') },
    { label: 'Expenses', icon: 'pi-money-bill', path: laboratoryPath('expenses') },
    { label: 'Suppliers', icon: 'pi-truck', path: laboratoryPath('suppliers') },
    { label: 'Trash', icon: 'pi-trash', path: laboratoryPath('trash') },
  ];

  constructor(
    public auth: AuthService,
    private router: Router,
  ) {}

  signOut(): void {
    this.auth.logout();
    this.router.navigate([laboratoryPath('auth/login')]);
  }
}
