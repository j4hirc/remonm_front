import { inject, Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';

import { environment } from '../../../environments/environment';
import {
  Material,
  MaterialRequest
} from '../models/material.model';

@Injectable({
  providedIn: 'root'
})
export class MaterialsService {
  private readonly http = inject(HttpClient);

  private readonly apiUrl = `${environment.apiUrl}/materials`;

  getAll(): Observable<Material[]> {
    return this.http.get<Material[]>(`${this.apiUrl}/all`);
  }

  getById(id: number): Observable<Material> {
    return this.http.get<Material>(`${this.apiUrl}/id/${id}`);
  }

  getByCategoryId(categoryId: number): Observable<Material[]> {
    return this.http.get<Material[]>(
      `${this.apiUrl}/category/${categoryId}`
    );
  }

  create(request: MaterialRequest): Observable<Material> {
    return this.http.post<Material>(`${this.apiUrl}/create`, request);
  }

  update(
    materialId: number,
    request: MaterialRequest
  ): Observable<Material> {
    return this.http.put<Material>(
      `${this.apiUrl}/update/${materialId}`,
      request
    );
  }

  delete(materialId: number): Observable<string> {
    return this.http.delete(`${this.apiUrl}/delete/${materialId}`, {
      responseType: 'text'
    });
  }
}