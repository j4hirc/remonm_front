export interface WarehouseMaterial {
  materialId: number;
  name: string;
  quantity: number;
  unit: string;
  added: boolean;
}
export interface WarehouseOrder {
  jobId: number;
  clientName: string;
  employeeName: string;
  managerName: string;
  status: 'PENDING' | 'IN_PROGRESS';
  description: string;
  materials: WarehouseMaterial[];
}
export interface WarehouseReport {
  date: string;
  label: string;
  orders: WarehouseOrder[];
}
export interface PayrollAdvance {
  id: number;
  date: string;
  comment: string;
  /** Precio reportado en ese avance (valor independiente) */
  price?: number | null;
  /** Estado del trabajo en ese momento */
  status?: string | null;
  files: Array<{ id: number; url: string; label: string }>;
}
export interface PayrollJob {
  statusLabel: string;
  advances: PayrollAdvance[];
  dateSource: string;
  jobId: number;
  date: string;
  clientName: string;
  pay: number;
}
export interface PayrollEmployee {
  employeeId: number;
  name: string;
  jobs: PayrollJob[];
  total: number;
}
export interface PayrollReport {
  start: string;
  end: string;
  employees: PayrollEmployee[];
  total: number;
}
