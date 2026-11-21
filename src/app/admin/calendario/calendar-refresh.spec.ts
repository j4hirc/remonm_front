import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting, HttpTestingController } from '@angular/common/http/testing';
import { provideRouter } from '@angular/router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import Swal from 'sweetalert2';
import { CalendarioAdminComponent } from './calendario.component';
import { JobsService } from '../../core/services/jobs.service';
import { environment } from '../../../environments/environment';

describe('Calendario después de eliminar un trabajo', () => {
  let http: HttpTestingController;
  let calendar: CalendarioAdminComponent;
  const jobsUrl = `${environment.apiUrl}/jobs/all`;
  const job = { jobId: 42, employeeId: 1, materials: [] };
  beforeEach(() => {
    vi.useFakeTimers();
    vi.spyOn(Swal, 'fire').mockResolvedValue({ isConfirmed: false, isDenied: false, isDismissed: true });
    vi.spyOn(Swal, 'close').mockImplementation(() => {});
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([])] });
    http = TestBed.inject(HttpTestingController);
    calendar = TestBed.runInInjectionContext(() => new CalendarioAdminComponent());
    calendar.ngOnInit();
    http.expectOne(jobsUrl).flush([job]);
    http.expectOne(`${environment.apiUrl}/user/all-users`).flush([]);
    expect((calendar as any).allJobs.length).toBe(1);
  });
  afterEach(() => {
    TestBed.resetTestingModule();
    vi.useRealTimers();
    vi.restoreAllMocks();
  });
  function flushReload() {
    http.expectOne(jobsUrl).flush([]);
    http.expectOne(`${environment.apiUrl}/user/all-users`).flush([]);
    expect((calendar as any).allJobs).toEqual([]);
    http.verify();
  }
  it('retira el trabajo del calendario abierto tras un DELETE confirmado', async () => {
    const addEvents = vi.fn();
    const removeEvents = vi.fn();
    (calendar as any).viewReady = true;
    (calendar as any).calendar = {
      batchRendering: (render: () => void) => render(),
      removeAllEventSources: removeEvents,
      addEventSource: addEvents
    };
    TestBed.inject(JobsService).delete(42).subscribe();
    http.expectOne(`${environment.apiUrl}/jobs/delete-job/42`).flush('Eliminado');
    await vi.advanceTimersByTimeAsync(200);
    flushReload();
    expect(removeEvents).toHaveBeenCalledOnce();
    expect(addEvents).toHaveBeenCalledWith([]);
  });
  it('consulta de nuevo al regresar a la pestaña del calendario', async () => {
    window.dispatchEvent(new Event('focus'));
    await vi.advanceTimersByTimeAsync(200);
    flushReload();
  });
  it('no oculta un trabajo cuando el servidor rechaza la eliminación', async () => {
    TestBed.inject(JobsService).delete(42).subscribe({ error: () => {} });
    http.expectOne(`${environment.apiUrl}/jobs/delete-job/42`).flush('Error', {status:500,statusText:'Error'});
    await vi.advanceTimersByTimeAsync(200);
    http.expectNone(jobsUrl);
    expect((calendar as any).allJobs.length).toBe(1);
    http.verify();
  });
  it('una carga nueva usa la respuesta actual de la API', () => {
    calendar.loadData();
    flushReload();
  });
  it('cancela la consulta anterior al actualizar después de borrar', async () => {
    calendar.loadData();
    const oldJobs = http.expectOne(jobsUrl);
    const oldUsers = http.expectOne(`${environment.apiUrl}/user/all-users`);
    TestBed.inject(JobsService).delete(42).subscribe();
    http.expectOne(`${environment.apiUrl}/jobs/delete-job/42`).flush('Eliminado');
    await vi.advanceTimersByTimeAsync(200);
    expect(oldJobs.cancelled).toBe(true);
    expect(oldUsers.cancelled).toBe(true);
    flushReload();
  });
  it('libera los listeners al destruir la vista', async () => {
    TestBed.resetTestingModule();
    window.dispatchEvent(new Event('focus'));
    await vi.advanceTimersByTimeAsync(200);
    http.expectNone(jobsUrl);
  });
});
