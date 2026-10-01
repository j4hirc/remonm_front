import { Job } from '../../models/job.model';

export interface ReportMaterialRow {
  materialId: number;
  name: string;
  quantity: number;
  unit: string;
  price: number;
  initialQuantity: number | null;
  initialUnitPrice: number | null;
  referenceQuantity: number;
  referenceUnit: string;
}

export const lineTotal = (quantity: number, price: number): number =>
  Math.round((quantity * price + Number.EPSILON) * 100) / 100;

const unit = (value: string | null | undefined): string =>
  !value || value === 'N/A' ? '' : value.trim();

export const materialChanged = (row: ReportMaterialRow): boolean =>
  row.quantity !== row.referenceQuantity || unit(row.unit) !== unit(row.referenceUnit);

/** Union retains removed original materials so their original quantities stay visible. */
export function buildReportMaterialRows(job: Job): ReportMaterialRow[] {
  const known = job.originalAssignmentAvailable === true;
  const initial = new Map((known ? job.originalMaterials ?? [] : []).map(row => [row.materialId, row]));
  const current = new Map((job.materials ?? []).map(row => [row.materialId, row]));
  const ids = new Set([...initial.keys(), ...current.keys()]);
  return [...ids].map(materialId => {
    const before = initial.get(materialId);
    const now = current.get(materialId);
    return {
      materialId,
      name: before?.name ?? now?.name ?? 'Material',
      quantity: now?.quantity ?? 0,
      unit: unit(now?.unit ?? before?.unit),
      price: before?.unitPrice ?? now?.price ?? 0,
      initialQuantity: known ? before?.quantity ?? 0 : null,
      initialUnitPrice: known ? before?.unitPrice ?? now?.price ?? 0 : null,
      referenceQuantity: known ? before?.quantity ?? 0 : now?.quantity ?? 0,
      referenceUnit: unit(known ? before?.unit ?? now?.unit : now?.unit)
    };
  });
}
