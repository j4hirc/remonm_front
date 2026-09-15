import { inject, Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';

export interface JobUpdateRequest {
  comment: string;
  jobId: number;
  employeeId: number;
  status: string;
  materials: Array<{ materialId: number; quantity: number; unit: string }>;
  materialIds: number[];
  newPrice: number;
}

@Injectable({ providedIn: 'root' })
export class JobUpdatesService {
  private readonly http = inject(HttpClient);
  private readonly apiUrl = `${environment.apiUrl}/job-updates`;

  create(data: JobUpdateRequest, files: File[]): Observable<unknown> {
    const formData = new FormData();
    formData.append(
      'data',
      new Blob([JSON.stringify(data)], { type: 'application/json' })
    );
    for (const file of files) {
      formData.append('files', file);
    }
    return this.http.post(`${this.apiUrl}/create`, formData);
  }
}