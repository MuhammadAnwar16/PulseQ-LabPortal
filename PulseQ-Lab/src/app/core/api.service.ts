import { Injectable } from '@angular/core';
import { HttpClient, HttpHeaders, HttpParams } from '@angular/common/http';
import { Observable, map } from 'rxjs';


import { API_BASE } from './api.constants';
import { AuthService } from './auth.service';
import {
  AuthUser,
  DashboardSummary,
  LabExpense,
  LabInventory,
  LabInvoice,
  LabSupplier,
  LabTestCatalog,
  LabTestOrder,
  LabTestResult,
} from './models/laboratory.models';

/** Request/response payload shapes (mirror backend schemas). */
export interface OrderPayload {
  patient_id: string;
  patient_name: string;
  patient_age?: number | null;
  patient_gender?: string | null;
  ordering_doctor_id?: string | null;
  ordering_doctor_name?: string | null;
  test_ids: string[];
  priority?: string;
  sample_type?: string | null;
  source?: string;
  notes?: string | null;
}
export interface SampleCollectPayload {
  sample_barcode: string;
  collected_by: string;
  collected_at?: string | null;
}
export interface ResultSavePayload {
  test_id: string;
  result_values: { param: string; value?: string | null; unit?: string | null; low?: number | null; high?: number | null; abnormal?: boolean }[];
  abnormal_flag?: string | null;
  entered_by: string;
  submit?: boolean;
}

@Injectable({ providedIn: 'root' })
export class ApiService {
  constructor(
    private http: HttpClient,
    private auth: AuthService,
  ) {}

  private authHeaders(): HttpHeaders {
    let h = new HttpHeaders({ 'Content-Type': 'application/json' });
    const token = this.auth.token;
    if (token) h = h.set('Authorization', `Bearer ${token}`);
    return h;
  }

  private get<T>(url: string, params?: Record<string, string | null | undefined>): Observable<T> {
    let p: HttpParams | undefined;
    if (params) {
      p = new HttpParams();
      for (const [k, v] of Object.entries(params)) {
        if (v != null) p = p.set(k, v);
      }
    }
    return this.http.get<any>(`${API_BASE}${url}`, { headers: this.authHeaders(), params: p }).pipe(
      map((res: any) => res && res.success !== undefined ? (res.data !== null && res.data !== undefined ? res.data : res) : res)
    );
  }

  private post<T>(url: string, body?: unknown): Observable<T> {
    return this.http.post<any>(`${API_BASE}${url}`, body, { headers: this.authHeaders() }).pipe(
      map((res: any) => res && res.success !== undefined ? (res.data !== null && res.data !== undefined ? res.data : res) : res)
    );
  }

  private put<T>(url: string, body?: unknown): Observable<T> {
    return this.http.put<any>(`${API_BASE}${url}`, body, { headers: this.authHeaders() }).pipe(
      map((res: any) => res && res.success !== undefined ? (res.data !== null && res.data !== undefined ? res.data : res) : res)
    );
  }

  private del<T>(url: string): Observable<T> {
    return this.http.delete<any>(`${API_BASE}${url}`, { headers: this.authHeaders() }).pipe(
      map((res: any) => res && res.success !== undefined ? (res.data !== null && res.data !== undefined ? res.data : res) : res)
    );
  }

  // --- Dashboard ---------------------------------------------------------- //
  dashboard(): Observable<DashboardSummary> {
    return this.get<DashboardSummary>('/staff/laboratory/dashboard/summary');
  }

  // --- Orders ------------------------------------------------------------- //
  listOrders(params?: Record<string, string | null | undefined>): Observable<LabTestOrder[]> {
    return this.get<LabTestOrder[]>('/staff/laboratory/orders', params);
  }
  getOrder(id: string): Observable<LabTestOrder> {
    return this.get<LabTestOrder>(`/staff/laboratory/orders/${id}`);
  }
  createOrder(p: OrderPayload): Observable<LabTestOrder> {
    return this.post<LabTestOrder>('/staff/laboratory/orders', p);
  }
  collectSample(id: string, p: SampleCollectPayload): Observable<LabTestOrder> {
    return this.post<LabTestOrder>(`/staff/laboratory/orders/${id}/collect`, p);
  }
  advanceOrder(id: string, toStatus?: string): Observable<LabTestOrder> {
    return this.post<LabTestOrder>(`/staff/laboratory/orders/${id}/advance`, { to_status: toStatus });
  }
  cancelOrder(id: string, reason?: string): Observable<LabTestOrder> {
    return this.post<LabTestOrder>(`/staff/laboratory/orders/${id}/cancel`, { reason });
  }

  // --- Results ------------------------------------------------------------ //
  saveResult(orderId: string, p: ResultSavePayload): Observable<LabTestResult> {
    return this.post<LabTestResult>(`/staff/laboratory/orders/${orderId}/results`, p);
  }
  verifyResult(orderId: string, resultId: string, verifiedBy: string): Observable<LabTestResult> {
    return this.post<LabTestResult>(
      `/staff/laboratory/orders/${orderId}/results/${resultId}/verify`,
      { verified_by: verifiedBy },
    );
  }

  // --- Catalog ------------------------------------------------------------ //
  listCatalog(includeInactive = false): Observable<LabTestCatalog[]> {
    return this.get<LabTestCatalog[]>('/staff/laboratory/catalog', {
      include_inactive: includeInactive ? 'true' : null,
    });
  }
  createCatalog(p: Partial<LabTestCatalog>): Observable<LabTestCatalog> {
    return this.post<LabTestCatalog>('/staff/laboratory/catalog', p);
  }
  updateCatalog(id: string, p: Partial<LabTestCatalog>): Observable<LabTestCatalog> {
    return this.put<LabTestCatalog>(`/staff/laboratory/catalog/${id}`, p);
  }
  deleteCatalog(id: string): Observable<{ message: string }> {
    return this.del<{ message: string }>(`/staff/laboratory/catalog/${id}`);
  }

  // --- Inventory ---------------------------------------------------------- //
  listInventory(): Observable<LabInventory[]> {
    return this.get<LabInventory[]>('/staff/laboratory/inventory');
  }
  createInventory(p: Partial<LabInventory>): Observable<LabInventory> {
    return this.post<LabInventory>('/staff/laboratory/inventory', p);
  }
  updateInventory(id: string, p: Partial<LabInventory>): Observable<LabInventory> {
    return this.put<LabInventory>(`/staff/laboratory/inventory/${id}`, p);
  }
  deleteInventory(id: string): Observable<{ message: string }> {
    return this.del<{ message: string }>(`/staff/laboratory/inventory/${id}`);
  }

  // --- Invoices ----------------------------------------------------------- //
  listInvoices(): Observable<LabInvoice[]> {
    return this.get<LabInvoice[]>('/staff/laboratory/invoices');
  }
  createInvoice(p: { order_id: string; amount: number; payment_method?: string | null }): Observable<LabInvoice> {
    return this.post<LabInvoice>('/staff/laboratory/invoices', p);
  }
  payInvoice(id: string, amount: number, method?: string | null): Observable<LabInvoice> {
    return this.post<LabInvoice>(`/staff/laboratory/invoices/${id}/payment`, {
      paid_amount: amount,
      payment_method: method,
    });
  }
  deleteInvoice(id: string): Observable<{ message: string }> {
    return this.del<{ message: string }>(`/staff/laboratory/invoices/${id}`);
  }

  // --- Expenses ----------------------------------------------------------- //
  listExpenses(): Observable<LabExpense[]> {
    return this.get<LabExpense[]>('/staff/laboratory/expenses');
  }
  createExpense(p: { category: string; description?: string | null; amount: number; incurred_on?: string | null }): Observable<LabExpense> {
    return this.post<LabExpense>('/staff/laboratory/expenses', p);
  }
  deleteExpense(id: string): Observable<{ message: string }> {
    return this.del<{ message: string }>(`/staff/laboratory/expenses/${id}`);
  }

  // --- Suppliers ---------------------------------------------------------- //
  listSuppliers(): Observable<LabSupplier[]> {
    return this.get<LabSupplier[]>('/staff/laboratory/suppliers');
  }
  createSupplier(p: { name: string; contact?: string | null; outstanding_balance?: number }): Observable<LabSupplier> {
    return this.post<LabSupplier>('/staff/laboratory/suppliers', p);
  }
  updateSupplier(id: string, p: { name?: string; contact?: string | null }): Observable<LabSupplier> {
    return this.put<LabSupplier>(`/staff/laboratory/suppliers/${id}`, p);
  }
  paySupplier(id: string, amount: number, note?: string | null): Observable<LabSupplier> {
    return this.post<LabSupplier>(`/staff/laboratory/suppliers/${id}/payment`, { amount, note });
  }
  deleteSupplier(id: string): Observable<{ message: string }> {
    return this.del<{ message: string }>(`/staff/laboratory/suppliers/${id}`);
  }

  // --- Trash -------------------------------------------------------------- //
  listTrash(): Observable<Record<string, unknown[]>> {
    return this.get<Record<string, unknown[]>>('/staff/laboratory/trash');
  }
  restore(model: string, id: string): Observable<unknown> {
    return this.post<unknown>('/staff/laboratory/trash/restore', { model, id });
  }

  // --- Reports ------------------------------------------------------------ //
  listReports(): Observable<LabTestOrder[]> {
    return this.get<LabTestOrder[]>('/staff/laboratory/reports');
  }
  /** Fetch the report PDF as a blob (carries the auth header). */
  getReportBlob(orderId: string): Observable<Blob> {
    return this.http.get(`${API_BASE}/staff/laboratory/reports/${orderId}/pdf`, {
      headers: this.authHeaders(),
      responseType: 'blob',
    });
  }
}
