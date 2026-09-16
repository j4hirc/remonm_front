import { Job } from '../models/job.model';

export function jobLocation(job: Pick<Job, 'address' | 'buildingNumber' | 'apartment'>): string {
  return [job.address || 'Sin dirección',
    job.buildingNumber?.trim() ? `Edificio: ${job.buildingNumber.trim()}` : '',
    job.apartment?.trim() ? `Departamento: ${job.apartment.trim()}` : ''
  ].filter(Boolean).join(' · ');
}

/** Solo para las plantillas que construyen HTML fuera de Angular. */
export function escapeLocationHtml(text: string): string {
  const entities: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
  return text.replace(/[&<>"']/g, c => entities[c]);
}
