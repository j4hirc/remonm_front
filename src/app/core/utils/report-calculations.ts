import { Job } from '../models/job.model';
import { User } from '../models/user.model';
import { Material } from '../models/material.model';
import { PayrollEmployee, PayrollReport, WarehouseMaterial, WarehouseReport } from '../models/reports.model';

const DAY = 86400000;
// Identificador de fecha civil: no representa un instante del backend.
function civilDay(year: number, month: number, day: number): number {
  return Date.UTC(year, month - 1, day) / DAY;
}
function todayDay(today: Date): number {
  return civilDay(today.getFullYear(), today.getMonth() + 1, today.getDate());
}
export function parseJobDay(value: string | number[]): number | null {
  const parts = Array.isArray(value) ? value : value.split('-').map(Number);
  const [year, month, day] = parts;
  if (![year, month, day].every(Number.isInteger) || month < 1 || month > 12 || day < 1 || day > 31) return null;
  const serial = civilDay(year, month, day);
  const parsed = new Date(serial * DAY);
  return parsed.getUTCFullYear() === year && parsed.getUTCMonth() + 1 === month && parsed.getUTCDate() === day ? serial : null;
}
export function formatDay(serial: number): string {
  const date = new Date(serial * DAY);
  return `${String(date.getUTCMonth() + 1).padStart(2, '0')}/${String(date.getUTCDate()).padStart(2, '0')}/${date.getUTCFullYear()}`;
}
function numberOr(value: unknown, fallback: number): number {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}
function employeeName(users: readonly User[], id: number): string {
  const user = users.find(item => item.userId === id);
  return user ? `${user.firstName || ''} ${user.lastName || ''}`.trim() || `ID: ${id}` : `ID: ${id}`;
}
export function buildWarehouseReport(jobs: readonly Job[], users: readonly User[], catalog: readonly Material[], offset: number, today = new Date()): WarehouseReport {
  const day = todayDay(today) + offset;
  const weekday = new Date(day * DAY).toLocaleDateString('es-ES', { weekday: 'long', timeZone: 'UTC' });
  const label = offset === 0 ? 'Hoy' : offset === 1 ? 'Mañana' : offset === -1 ? 'Ayer' : weekday.charAt(0).toUpperCase() + weekday.slice(1);
  const orders = jobs.filter(job => (job.status === 'PENDING' || job.status === 'IN_PROGRESS') && parseJobDay(job.jobDate) === day).map(job => {
    const merged = new Map<number, WarehouseMaterial>();
    const unitFor = (id: number, unit?: string | null): string => catalog.find(m => m.materialId === id)?.unit || (unit && unit !== 'N/A' ? unit : '');
    for (const material of job.materials || []) {
      const legacyCount: unknown = 'cant' in material ? material.cant : undefined;
      const legacyName: unknown = 'material' in material ? material.material : undefined;
      merged.set(material.materialId, {
        materialId: material.materialId,
        name: material.name || (typeof legacyName === 'string' ? legacyName : 'Material'),
        // Compatibilidad con la regla del original: 0/vacío se interpreta como 1.
        quantity: numberOr(material.quantity || legacyCount || 1, 1),
        unit: unitFor(material.materialId, material.unit),
        added: false
      });
    }
    for (const material of job.necessaryMaterials || []) {
      const previous = merged.get(material.materialId);
      const unit = unitFor(material.materialId, material.unit);
      merged.set(material.materialId, {
        materialId: material.materialId,
        name: previous?.name || material.name || 'Material',
        quantity: numberOr(material.quantity || 1, 1),
        unit: unit || previous?.unit || '',
        added: previous?.added ?? true
      });
    }
    return {
      jobId: job.jobId,
      clientName: job.clientName || 'Cliente sin nombre',
      address: job.address?.trim() || '',
      buildingNumber: job.buildingNumber?.trim() || '',
      apartment: job.apartment?.trim() || '',
      employeeName: employeeName(users, job.employeeId),
      managerName: job.nameManager || 'Sin manager asignado',
      status: job.status as 'PENDING' | 'IN_PROGRESS',
      description: (job.description || '')
        .split('[MATERIALES PRE-ASIGNADOS]:')[0]
        .trim(),
      materials: [...merged.values()].sort(
        (a, b) => a.materialId - b.materialId
      )
    };
  });
  // Siempre devuelve la selección actual, incluso si está vacía.
  return { date: formatDay(day), label, orders };
}
// Fecha civil del reporte: soporta LocalDateTime ISO y arrays de Jackson.
function updateDay(value: string | number[]): number | null {
  if (Array.isArray(value)) return parseJobDay(value.slice(0, 3));
  const match = /^(\d{4}-\d{2}-\d{2})(?:T|\s|$)/.exec(value);
  return match ? parseJobDay(match[1]) : null;
}
export function buildPayrollReport(
  jobs: readonly Job[],
  users: readonly User[],
  offset: number,
  today = new Date()
): PayrollReport {
  // Conserva los períodos actuales de 14 días.
  const epoch = civilDay(2023, 12, 31);
  const start =
    epoch +
    (Math.floor((todayDay(today) - epoch) / 14) + offset) * 14;
  const end = start + 13;

  const groups = new Map<number, PayrollEmployee>();
  const seenJobs = new Set<number>();

  for (const job of jobs) {
    const status = (job.status || '').trim().toUpperCase();

    // Solo trabajos completados o en progreso.
    if (
      !['IN_PROGRESS', 'COMPLETED'].includes(status) ||
      !job.employeeId ||
      seenJobs.has(job.jobId)
    ) {
      continue;
    }

    // La fecha asignada determina la quincena.
    const startDay = job.jobDate
      ? parseJobDay(job.jobDate)
      : null;

    if (
      startDay === null ||
      startDay < start ||
      startDay > end
    ) {
      continue;
    }

    seenJobs.add(job.jobId);

    const seenUpdates = new Set<number>();

    const datedUpdates = (job.updateJob || [])
      .filter(update => {
        if (seenUpdates.has(update.jobUpdateId)) {
          return false;
        }

        seenUpdates.add(update.jobUpdateId);
        return true;
      })
      .map(update => ({
        update,
        day: update.date ? updateDay(update.date) : null
      }))
      .filter(
        (
          item
        ): item is {
          update: NonNullable<Job['updateJob']>[number];
          day: number;
        } => item.day !== null
      )
      .sort(
        (a, b) =>
          a.day - b.day ||
          a.update.jobUpdateId - b.update.jobUpdateId
      );

    // Último reporte del trabajo, aunque sea de otra quincena.
    const lastUpdate = datedUpdates[datedUpdates.length - 1];

    const startDate = formatDay(startDay);
    const endDate = lastUpdate
      ? formatDay(lastUpdate.day)
      : 'Sin fecha registrada';

    let group = groups.get(job.employeeId);

    if (!group) {
      const hasUser = users.some(
        user => user.userId === job.employeeId
      );

      group = {
        employeeId: job.employeeId,
        name: hasUser
          ? employeeName(users, job.employeeId)
          : job.nameEmployee?.trim() || `ID: ${job.employeeId}`,
        jobs: [],
        total: 0
      };

      groups.set(job.employeeId, group);
    }

    // Se cuenta una sola vez el pago actual del trabajo.
    const pay =
      Math.round(Math.max(0, numberOr(job.pay, 0)) * 100) / 100;

    group.jobs.push({
      jobId: job.jobId,

      // Los componentes existentes usan "date" para ordenar.
      date: startDate,
      dateSource: 'Fecha asignada al trabajo',

      startDate,
      endDate,

      statusLabel:
        status === 'COMPLETED' ? 'Completado' : 'En progreso',

      clientName: job.clientName || 'Cliente sin nombre',
      address: job.address?.trim() || '',

      description: (job.description || '')
        .split('[MATERIALES PRE-ASIGNADOS]:')[0]
        .trim(),

      buildingNumber: job.buildingNumber?.trim() || '',
      apartment: job.apartment?.trim() || '',

      pay,

      // Historial informativo: no suma pagos adicionales.
      advances: datedUpdates.map(({ update, day }) => ({
        id: update.jobUpdateId,
        date: formatDay(day),
        comment: update.comment || 'Sin comentario',

        price:
          update.price != null &&
          Number.isFinite(Number(update.price))
            ? Math.round(
                Math.max(0, Number(update.price)) * 100
              ) / 100
            : null,

        status: update.status || null,

        files: (update.evidences || []).map((evidence, index) => ({
          id: evidence.evidenceId,
          url: evidence.imageUri,
          label: /\.pdf(?:[?#]|$)/i.test(evidence.imageUri)
            ? 'Reporte PDF'
            : `Evidencia ${index + 1}`
        }))
      }))
    });

    group.total = Math.round((group.total + pay) * 100) / 100;
  }

  const employees = [...groups.values()].sort(
    (a, b) => a.employeeId - b.employeeId
  );

  return {
    start: formatDay(start),
    end: formatDay(end),
    employees,
    total:
      Math.round(
        employees.reduce(
          (sum, employee) => sum + employee.total,
          0
        ) * 100
      ) / 100
  };
}
