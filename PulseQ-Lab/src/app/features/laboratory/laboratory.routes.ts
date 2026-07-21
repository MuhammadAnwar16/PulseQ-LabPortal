import { Routes } from '@angular/router';
import { authGuard } from '../../shared/guards/auth.guard';

/**
 * Child routes for the laboratory portal (resolved relative to the layout,
 * which supplies the sidebar + <router-outlet>). Every screen is lazy-loaded
 * and gated by authGuard. Login lives OUTSIDE this tree (no sidebar).
 *
 * Internal links must use laboratoryPath() so they work on a subdomain or
 * nested under /staff/laboratory.
 */
export const laboratoryChildren: Routes = [
  {
    path: 'dashboard',
    loadComponent: () =>
      import('./dashboard/dashboard.component').then((m) => m.DashboardComponent),
    canActivate: [authGuard],
  },
  {
    path: 'orders',
    loadComponent: () =>
      import('./test-orders/test-orders.component').then((m) => m.TestOrdersComponent),
    canActivate: [authGuard],
  },
  {
    path: 'sample-collection',
    loadComponent: () =>
      import('./sample-collection/sample-collection.component').then(
        (m) => m.SampleCollectionComponent,
      ),
    canActivate: [authGuard],
  },
  {
    path: 'result-entry',
    loadComponent: () =>
      import('./result-entry/result-entry.component').then((m) => m.ResultEntryComponent),
    canActivate: [authGuard],
  },
  {
    path: 'verification',
    loadComponent: () =>
      import('./result-verification/result-verification.component').then(
        (m) => m.ResultVerificationComponent,
      ),
    canActivate: [authGuard],
  },
  {
    path: 'reports',
    loadComponent: () =>
      import('./reports/reports.component').then((m) => m.ReportsComponent),
    canActivate: [authGuard],
  },
  {
    path: 'catalog',
    loadComponent: () =>
      import('./test-catalog/test-catalog.component').then((m) => m.TestCatalogComponent),
    canActivate: [authGuard],
  },
  {
    path: 'inventory',
    loadComponent: () =>
      import('./inventory/inventory.component').then((m) => m.InventoryComponent),
    canActivate: [authGuard],
  },
  {
    path: 'billing',
    loadComponent: () =>
      import('./billing/billing.component').then((m) => m.BillingComponent),
    canActivate: [authGuard],
  },
  {
    path: 'expenses',
    loadComponent: () =>
      import('./expenses/expenses.component').then((m) => m.ExpensesComponent),
    canActivate: [authGuard],
  },
  {
    path: 'suppliers',
    loadComponent: () =>
      import('./suppliers/suppliers.component').then((m) => m.SuppliersComponent),
    canActivate: [authGuard],
  },
  {
    path: 'trash',
    loadComponent: () =>
      import('./trash/trash.component').then((m) => m.TrashComponent),
    canActivate: [authGuard],
  },
];
