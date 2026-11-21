import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting, HttpTestingController } from '@angular/common/http/testing';
import { provideRouter, ActivatedRoute, convertToParamMap } from '@angular/router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import Swal from 'sweetalert2';
import { CalendarioAdminComponent } from './calendario.component';
import { CalendarioJefeComponent } from '../../jefe/calendario/calendario.component';
import { CalendarioEmployeeComponent } from '../../employee/calendario/calendario.component';
import { CalendarioBodegueroComponent } from '../../bodeguero/calendario/calendario.component';
import { environment } from '../../../environments/environment';

for (const Component of [CalendarioAdminComponent, CalendarioJefeComponent, CalendarioEmployeeComponent, CalendarioBodegueroComponent]) {
  describe(`Un clic durante recarga: ${Component.name}`, () => {
    let http: HttpTestingController;
    let calendar: any;
    const jobsUrl = `${environment.apiUrl}/jobs/all`;
    const usersUrl = `${environment.apiUrl}/user/all-users`;
    const job = { jobId: 42, employeeId: 1, materials: [], description: 'Pintar', status: 'PENDING' };
    beforeEach(() => {
      vi.useFakeTimers();
      vi.spyOn(window, 'scrollTo').mockImplementation(() => {});
      vi.stubGlobal('matchMedia', () => ({ matches: false, addEventListener() {}, removeEventListener() {} }));
      TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([]),
        { provide: ActivatedRoute, useValue: { snapshot: { queryParamMap: convertToParamMap({}) } } }
      ] });
      http = TestBed.inject(HttpTestingController);
      calendar = TestBed.runInInjectionContext(() => new (Component as any)());
      calendar.ngOnInit();
      http.expectOne(jobsUrl).flush([job]);
      http.expectOne(usersUrl).flush([]);
    });
    afterEach(() => {
      Swal.close();
      TestBed.resetTestingModule();
      vi.useRealTimers();
      vi.unstubAllGlobals();
      vi.restoreAllMocks();
    });
    function clickJob() {
      calendar.onEventClick({ event: { id: '42', title: 'Trabajo 42', extendedProps: { job, description: 'Pintar', employee: 'Pedro', manager: 'Ana' } } });
      return Swal.getPopup();
    }
    for (const fail of [false, true]) {
      it(`mantiene abierto el trabajo si la recarga ${fail ? 'falla' : 'termina'}`, async () => {
        window.dispatchEvent(new Event('focus'));
        const popup = clickJob();
        expect(popup).not.toBeNull();
        await vi.advanceTimersByTimeAsync(150);
        const popupAfterReloadStarts = Swal.getPopup();
        const jobs = http.expectOne(jobsUrl);
        const users = http.expectOne(usersUrl);
        users.flush([]);
        jobs.flush(fail ? 'Error' : [job], fail ? { status: 500, statusText: 'Error' } : {});
        expect(popupAfterReloadStarts).toBe(popup);
        expect(Swal.getPopup()).toBe(popup);
        http.verify();
      });
    }
    it('mantiene el trabajo abierto si se pulsa con la petición en curso', async () => {
      window.dispatchEvent(new Event('focus'));
      await vi.advanceTimersByTimeAsync(150);
      const popup = clickJob();
      http.expectOne(jobsUrl).flush([job]);
      http.expectOne(usersUrl).flush([]);
      expect(Swal.getPopup()).toBe(popup);
    });
  });
}
