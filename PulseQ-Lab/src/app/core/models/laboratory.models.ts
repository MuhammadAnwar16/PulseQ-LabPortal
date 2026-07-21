/** TypeScript models mirroring the FastAPI lab schemas / db models. */

export interface RefRange {
  param: string;
  unit?: string | null;
  low?: number | null;
  high?: number | null;
  text?: string | null;
}

export interface ResultValue {
  param: string;
  value?: string | null;
  unit?: string | null;
  low?: number | null;
  high?: number | null;
  abnormal?: boolean;
}

export interface LabTestCatalog {
  id: string;
  hospital_id: string;
  name: string;
  code: string;
  category: string;
  sample_type: string;
  price: number;
  turnaround_hours: number;
  reference_ranges: RefRange[];
  is_active: boolean;
  is_deleted: boolean;
  created_at: string;
  updated_at: string;
}

export interface LabTestResult {
  id: string;
  order_id: string;
  test_id: string;
  result_values: ResultValue[];
  abnormal_flag?: string | null;
  status: string; // draft | verified
  entered_by?: string | null;
  verified_by?: string | null;
  verified_at?: string | null;
  report_pdf_path?: string | null;
  is_deleted: boolean;
  created_at: string;
  updated_at: string;
}

export interface LabTestOrder {
  id: string;
  hospital_id: string;
  patient_id: string;
  patient_name: string;
  patient_age?: number | null;
  patient_gender?: string | null;
  ordering_doctor_id?: string | null;
  ordering_doctor_name?: string | null;
  test_ids: string[];
  tests: LabTestCatalog[];
  status: string; // ordered | sample_collected | processing | completed | reported | cancelled
  priority: string; // routine | urgent | stat
  sample_type?: string | null;
  sample_barcode?: string | null;
  collected_at?: string | null;
  collected_by?: string | null;
  source: string; // internal | referred
  notes?: string | null;
  is_deleted: boolean;
  created_at: string;
  updated_at: string;
  results?: LabTestResult[];
}

export interface LabInventory {
  id: string;
  hospital_id: string;
  name: string;
  sku: string;
  quantity: number;
  reorder_level: number;
  expiry_date?: string | null;
  unit_cost: number;
  category?: string | null;
  is_deleted: boolean;
  created_at: string;
  updated_at: string;
}

export interface LabInvoice {
  id: string;
  hospital_id: string;
  order_id: string;
  amount: number;
  paid_amount: number;
  status: string; // unpaid | partial | paid
  payment_method?: string | null;
  is_deleted: boolean;
  created_at: string;
  updated_at: string;
}

export interface LabSupplier {
  id: string;
  hospital_id: string;
  name: string;
  contact?: string | null;
  outstanding_balance: number;
  is_deleted: boolean;
  created_at: string;
  updated_at: string;
}

export interface LabExpense {
  id: string;
  hospital_id: string;
  category: string;
  description?: string | null;
  amount: number;
  incurred_on?: string | null;
  is_deleted: boolean;
  created_at: string;
  updated_at: string;
}

export interface DashboardStats {
  pending_orders: number;
  samples_collected_today: number;
  in_processing: number;
  completed_today: number;
  low_stock_reagents: number;
  revenue_today: number;
}

export interface DashboardSummary {
  stats: DashboardStats;
  queue: LabTestOrder[];
  low_stock: LabInventory[];
}

export interface AuthUser {
  id: string;
  hospital_id: string;
  username: string;
  full_name: string;
  role: string;
  is_active: boolean;
}

export const ORDER_STATUSES = [
  'ordered',
  'sample_collected',
  'processing',
  'completed',
  'reported',
  'cancelled',
] as const;

export const PRIORITIES = ['routine', 'urgent', 'stat'] as const;
