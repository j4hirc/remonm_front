import { Material } from './material.model';

export type JobStatus =
  | 'PENDING'
  | 'IN_PROGRESS'
  | 'COMPLETED'
  | 'CANCELLED';

export interface JobMaterialSelection {
  materialId: number;
  quantity: number;
  unit?: string | null;
}

/** Foto o PDF de una actualización */
export interface Evidence {
  evidenceId: number;
  imageUri: string;
}

/** Avance que sube el empleado (comentario + evidencias) */
export interface JobUpdate {
  jobUpdateId: number;
  comment?: string | null;
  date: string | number[];
  evidences?: Evidence[];
}

export interface Job {
  jobId: number;
  clientName: string;
  clientPhone: string;
  description?: string | null;
  address: string;
  latitude: number;
  longitude: number;
  safeDepositBoxCodes?: string | null;
  quickbooksInvoice?: string | null;
  status: JobStatus | string;
  pay: number;
  jobDate: string | number[];
  employeeId: number;
  managerId: number;
  nameEmployee?: string | null;
  nameManager?: string | null;
  materials?: Material[];
  necessaryMaterials?: Array<{
    materialId: number;
    name?: string;
    quantity?: number;
    unit?: string;
    estimatedPrice?: number;
    price?: number;
  }>;
  priority?: number | null;
  blueprintUrls?: string[];

  /** ← Aquí va: lista de avances / evidencias del trabajo */
  updateJob?: JobUpdate[];
}

export interface JobRequest {
  clientName: string;
  clientPhone: string;
  description?: string | null;
  address: string;
  latitude: number;
  longitude: number;
  safeDepositBoxCodes?: string | null;
  quickbooksInvoice?: string | null;
  status: string;
  pay: number;
  jobDate: string;
  employeeId: number;
  managerId: number;
  materials?: JobMaterialSelection[];
  necessaryMaterials?: Array<{
    materialId: number;
    name?: string;
    quantity: number;
    unit?: string;
    estimatedPrice?: number;
  }>;
  priority?: number;
}