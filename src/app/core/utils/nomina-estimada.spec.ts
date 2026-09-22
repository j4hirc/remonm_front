import { describe, expect, it } from 'vitest';
import { Job, JobUpdate } from '../models/job.model';
import { buildPayrollReport } from './report-calculations';
const today = new Date(2026, 8, 18, 12);
const advance = (id: number, date: string | number[]): JobUpdate => ({jobUpdateId:id,date,comment:'Trabajo realizado',evidences:[]});
const job = (overrides: Partial<Job> = {}): Job => ({jobId:1,clientName:'Prueba',clientPhone:'',address:'Prueba',latitude:0,longitude:0,status:'IN_PROGRESS',pay:100,jobDate:'2026-09-01',employeeId:7,managerId:5,updateJob:[advance(1,'2026-09-18T10:30:00')],...overrides});
describe('Nómina estimada con API original',()=>{
 it('incluye en proceso por avance aunque la fecha programada sea anterior',()=>{
  const r=buildPayrollReport([job()],[],0,today);expect(r.total).toBe(100);expect(r.employees[0].jobs[0].statusLabel).toBe('En proceso');
 });
 it('no multiplica el importe al tener varios avances o trabajos duplicados',()=>{
  const j=job({updateJob:[advance(1,'2026-09-18T10:00:00'),advance(2,[2026,9,19,11,0]),advance(2,[2026,9,19,11,0])]});
  const r=buildPayrollReport([j,j],[],0,today);expect(r.total).toBe(100);expect(r.employees[0].jobs[0].advances).toHaveLength(2);
 });
 it('incluye completados, pero excluye pendientes y cancelados',()=>{
  expect(buildPayrollReport([job({status:'COMPLETED'})],[],0,today).total).toBe(100);
  expect(buildPayrollReport([job({status:'PENDING'}),job({jobId:2,status:'CANCELLED'})],[],0,today).total).toBe(0);
 });
 it('usa fecha programada solo si no hay avances con fechas válidas',()=>{
  expect(buildPayrollReport([job({jobDate:'2026-09-18',updateJob:[]})],[],0,today).total).toBe(100);
  expect(buildPayrollReport([job({jobDate:'2026-09-18',updateJob:[advance(1,'2026-09-25T11:00:00')]})],[],0,today).total).toBe(0);
 });
 it('filtra los avances por período y mantiene explícitamente el estimado actual',()=>{
  const j=job({updateJob:[advance(1,'2026-09-18T11:00:00'),advance(2,'2026-09-25T11:00:00')]});
  const first=buildPayrollReport([j],[],0,today),second=buildPayrollReport([j],[],1,today);
  expect(first.total).toBe(100);expect(second.total).toBe(100);
  expect(first.employees[0].jobs[0].advances[0].id).toBe(1);expect(second.employees[0].jobs[0].advances[0].id).toBe(2);
 });
 it('conserva las evidencias y reconoce PDFs con parámetros',()=>{
  const a={...advance(1,[2026,9,18,10]),evidences:[{evidenceId:9,imageUri:'https://example.com/reporte.pdf?token=demo'}]};
  const files=buildPayrollReport([job({updateJob:[a]})],[],0,today).employees[0].jobs[0].advances[0].files;
  expect(files[0].label).toBe('Reporte PDF');
 });
 it('rechaza fechas imposibles y no muestra importes no finitos',()=>{
  expect(buildPayrollReport([job({jobDate:'2026-02-30',updateJob:[advance(1,'2026-02-30T10:00:00')]})],[],0,today).total).toBe(0);
  expect(buildPayrollReport([job({pay:NaN})],[],0,today).total).toBe(0);
 });
});
