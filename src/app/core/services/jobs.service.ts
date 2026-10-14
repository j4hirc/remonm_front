import { inject, Injectable } from '@angular/core';
import { HttpClient, HttpContext} from '@angular/common/http';
import { map, Observable } from 'rxjs';


import {
  NAVIGATION_CACHE
} from '../interceptors/navigation-cache.interceptor';

import { environment } from '../../../environments/environment';
import { Job, JobRequest } from '../models/job.model';
import { withCurrentMaterialPay } from './utils/job-current-pay';

@Injectable({
  providedIn: 'root'
})
export class JobsService {
  private readonly http = inject(HttpClient);
  private readonly apiUrl = `${environment.apiUrl}/jobs`;

  getAll(_useNavigationCache = false): Observable<Job[]> {
  return this.http.get<Job[]>(`${this.apiUrl}/all`, {
    context: new HttpContext().set(
      NAVIGATION_CACHE,
      false
    )
  }).pipe(map(jobs => jobs.map(withCurrentMaterialPay)));
}

  getById(id: number): Observable<Job> {
    return this.http.get<Job>(`${this.apiUrl}/find-id/${id}`)
      .pipe(map(withCurrentMaterialPay));
  }

  create(request: JobRequest, files: File[] = []): Observable<Job> {
    const formData = this.toFormData(request, files);
    return this.http.post<Job>(`${this.apiUrl}/create-job`, formData)
      .pipe(map(withCurrentMaterialPay));
  }

  update(
    id: number,
    request: JobRequest,
    files: File[] = []
  ): Observable<Job> {
    const formData = this.toFormData(request, files);
    return this.http.put<Job>(`${this.apiUrl}/update-job/${id}`, formData)
      .pipe(map(withCurrentMaterialPay));
  }

  delete(id: number): Observable<string> {
    return this.http.delete(`${this.apiUrl}/delete-job/${id}`, {
      responseType: 'text'
    });
  }

  private toFormData(request: JobRequest, files: File[]): FormData {
    const formData = new FormData();
    formData.append(
      'data',
      new Blob([JSON.stringify(request)], { type: 'application/json' })
    );
    for (const file of files) {
      formData.append('files', file);
    }
    return formData;
  }
}
