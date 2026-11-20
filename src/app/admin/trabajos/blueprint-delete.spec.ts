import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ActivatedRoute, convertToParamMap, Router } from '@angular/router';
import { SwalPortalTargets } from '@sweetalert2/ngx-sweetalert2';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import Swal from 'sweetalert2';
import { TrabajosComponent } from './trabajos.component';
import { TrabajosJefeComponent } from '../../jefe/trabajos/trabajos.component';
import { environment } from '../../../environments/environment';

for (const Component of [TrabajosComponent, TrabajosJefeComponent]) {
  describe(`Eliminar plano: ${Component.name}`, () => {
    let component: any;
    let http: HttpTestingController;
    const url = 'https://example.test/storage/v1/object/public/plans/first.pdf';
    const second = 'https://example.test/storage/v1/object/public/plans/second.pdf';
    beforeEach(() => {
      TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting(),
        { provide: Router, useValue: { navigate: vi.fn() } },
        { provide: ActivatedRoute, useValue: {snapshot:{queryParamMap:convertToParamMap({})}} },
        { provide: SwalPortalTargets, useValue: {} }
      ] });
      component = TestBed.runInInjectionContext(() => new Component());
      http = TestBed.inject(HttpTestingController);
      component.editingId.set(42);
      component.editorOpen.set(true);
      component.existingBlueprintUrls.set([url, second]);
      component.jobs.set([{jobId:42, blueprintUrls:[url,second]}]);
      component.form.controls.description.setValue('Cambios sin guardar');
    });
    afterEach(() => { http.verify(); TestBed.resetTestingModule(); });
    it('pide confirmación sin borrar ni abrir otro SweetAlert', () => {
      const popup = vi.spyOn(Swal, 'fire');
      component.requestBlueprintDelete(url);
      expect(component.pendingBlueprintDelete()).toBe(url);
      expect(component.existingBlueprintUrls()).toEqual([url,second]);
      http.expectNone(`${environment.apiUrl}/jobs/42/blueprints`);
      expect(popup).not.toHaveBeenCalled();
      popup.mockRestore();
    });
    it('elimina solo después de éxito y conserva otros planos y el formulario', async () => {
      component.requestBlueprintDelete(url);
      const pending = component.confirmBlueprintDelete(url);
      const request = http.expectOne(`${environment.apiUrl}/jobs/42/blueprints`);
      expect(request.request.method).toBe('DELETE');
      expect(request.request.body).toEqual({url});
      expect(component.existingBlueprintUrls()).toEqual([url,second]);
      request.flush([second]);
      await pending;
      expect(component.existingBlueprintUrls()).toEqual([second]);
      expect(component.jobs()[0].blueprintUrls).toEqual([second]);
      expect(component.form.controls.description.value).toBe('Cambios sin guardar');
      expect(component.isSaving()).toBe(false);
    });
    it('mantiene el plano y muestra error cuando falla el almacenamiento', async () => {
      component.requestBlueprintDelete(url);
      const pending = component.confirmBlueprintDelete(url);
      http.expectOne(`${environment.apiUrl}/jobs/42/blueprints`).flush(
        {message:'No se pudo eliminar el archivo'}, {status:502,statusText:'Bad Gateway'});
      await pending;
      expect(component.existingBlueprintUrls()).toEqual([url,second]);
      expect(component.blueprintDeleteError()).toContain('No se pudo eliminar');
      expect(component.isSaving()).toBe(false);
    });
    it('impide borrar al crear o duplicar, y sin confirmación', async () => {
      await component.confirmBlueprintDelete(url);
      component.editingId.set(null);
      component.requestBlueprintDelete(url);
      expect(component.pendingBlueprintDelete()).toBeNull();
      component.editingId.set(42);
      component.isDuplicating.set(true);
      component.requestBlueprintDelete(url);
      expect(component.pendingBlueprintDelete()).toBeNull();
      http.expectNone(`${environment.apiUrl}/jobs/42/blueprints`);
    });
  });
}
