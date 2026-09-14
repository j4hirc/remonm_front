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
export interface PayrollJob {
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
