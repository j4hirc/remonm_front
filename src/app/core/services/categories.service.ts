import { inject, Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';

import { environment } from '../../../environments/environment';
import {
  Category,
  CategoryRequest
} from '../models/category.model';

@Injectable({
  providedIn: 'root'
})
export class CategoriesService {
  private readonly http = inject(HttpClient);

  private readonly apiUrl =
    `${environment.apiUrl}/categories`;

  getAll(): Observable<Category[]> {
    return this.http.get<Category[]>(`${this.apiUrl}/all`);
  }

  create(request: CategoryRequest): Observable<Category> {
    return this.http.post<Category>(
      `${this.apiUrl}/create`,
      request
    );
  }

  update(
    categoryId: number,
    request: CategoryRequest
  ): Observable<Category> {
    return this.http.put<Category>(
      `${this.apiUrl}/update/${categoryId}`,
      request
    );
  }

  delete(categoryId: number): Observable<string> {
    return this.http.delete(
      `${this.apiUrl}/delete/${categoryId}`,
      { responseType: 'text' }
    );
  }
}