import { describe, expect, it } from 'vitest';
import { buildPayrollReport } from './report-calculations';
import { Job, JobUpdate } from '../models/job.model';
const today = new Date(2026, 9, 10, 12);
const update = (id: number, date: string | number[], status: string | null = 'REVIEW'): JobUpdate => ({jobUpdateId: id, date, status});
const job = (changes: Partial<Job> = {}): Job => ({
  jobId: 139, employeeId: 15, managerId: 5, clientName: '', clientPhone: '',
  address: '', latitude: 0, longitude: 0, status: 'COMPLETED', pay: 1315.10,
  jobDate: '2026-10-16', updateJob: [update(114, '2026-10-20T16:58:13.478148')], ...changes
});
const report = (jobs: Job[], offset = 0) => buildPayrollReport(jobs, [], offset, today);
describe('Nómina compatible con reportes históricos', () => {
  it('139 pasa del 4–17 al 18–31 aunque su reporte sea REVIEW', () => {
    expect(report([job()]).total).toBe(0);
    const r = report([job()], 1);
    expect([r.start, r.end, r.total]).toEqual(['10/18/2026', '10/31/2026', 1315.10]);
    expect(r.employees[0].jobs[0]).toMatchObject({startDate: '10/16/2026', endDate: '10/20/2026'});
  });
  it.each(['REVIEW', 'IN_PROGRESS', 'COMPLETED', null])('incluye completados con reporte %s', status => {
    expect(report([job({updateJob: [update(1, '2026-10-20', status)]})], 1).total).toBe(1315.10);
  });
  it.each(['REVIEW', 'IN_PROGRESS', 'PENDING', 'CANCELLED'])('excluye el trabajo si su estado actual es %s', status => {
    expect(report([job({status})], 1).total).toBe(0);
  });
  it('conserva los completados sin reportes sin inventar fecha Fin', () => {
    const r = report([job({updateJob: []})]);
    expect(r.total).toBe(1315.10);
    expect(r.employees[0].jobs[0].endDate).toBe('Sin fecha registrada');
    expect(r.employees[0].jobs[0].dateSource).toContain('cierre no registrado');
    expect(report([job({updateJob: []})], 1).total).toBe(0);
  });
  it('ordena reportes, acepta arrays y no duplica pagos ni avances', () => {
    const j = job({updateJob: [update(2, [2026,10,20,10]), update(1, '2026-10-16'), update(2, [2026,10,20,10])]});
    const r = report([j,j],1);
    expect(r.total).toBe(1315.10);
    expect(r.employees[0].jobs[0].advances).toHaveLength(2);
    expect(report([j]).total).toBe(0);
  });
  it('incluye los extremos del período y rechaza fechas imposibles', () => {
    for (const date of ['2026-10-04T00:00:00','2026-10-17T23:59:59']) {
      expect(report([job({updateJob:[update(1,date)]})]).total).toBe(1315.10);
    }
    expect(report([job({jobDate:'2026-02-30', updateJob:[]})]).total).toBe(0);
  });
  it('conserva pago actual y evidencias sin sumar el precio histórico', () => {
    const u = {...update(1,'2026-10-20'), price:100, evidences:[{evidenceId:1,imageUri:'https://example.com/a.pdf?x=1'}]};
    const r = report([job({pay:245.42,updateJob:[u]})],1);
    expect(r.total).toBe(245.42);
    expect(r.employees[0].jobs[0].advances[0].files[0].label).toBe('Reporte PDF');
  });
});

describe('Fecha de finalización guardada', () => {
  it('tiene prioridad sobre el reporte y la fecha asignada', () => {
    const j = job({completedDate:'2026-10-16'});
    expect(report([j]).total).toBe(1315.10);
    expect(report([j],1).total).toBe(0);
    expect(report([j]).employees[0].jobs[0]).toMatchObject({endDate:'10/16/2026',dateSource:'Fecha de finalización guardada'});
  });
  it('incluye un cierre sin reportes en su fecha confirmada', () => {
    const j = job({jobDate:'2026-09-01',updateJob:[],completedDate:[2026,10,20]});
    expect(report([j],1).total).toBe(1315.10);
    expect(report([j],1).employees[0].jobs[0].endDate).toBe('10/20/2026');
  });
  it('conserva los históricos sin fecha guardada', () => {
    expect(report([job({completedDate:null})],1).total).toBe(1315.10);
    expect(report([job({completedDate:null,updateJob:[]})]).total).toBe(1315.10);
  });
  it('un reporte posterior no mueve el cierre guardado a otra quincena', () => {
    const j=job({completedDate:'2026-10-16',updateJob:[update(1,'2026-10-20')]});
    expect(report([j]).employees[0].jobs[0].date).toBe('10/16/2026');
    expect(report([j],1).total).toBe(0);
  });
});
