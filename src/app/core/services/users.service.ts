import { inject, Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';

import { environment } from '../../../environments/environment';
import { User, UserRequest } from '../models/user.model';

@Injectable({
  providedIn: 'root'
})
export class UsersService {
  private readonly http = inject(HttpClient);

  private readonly apiUrl = `${environment.apiUrl}/user`;

  getAll(): Observable<User[]> {
    return this.http.get<User[]>(`${this.apiUrl}/all-users`);
  }

  getById(id: number): Observable<User> {
    return this.http.get<User>(`${this.apiUrl}/id-user/${id}`);
  }

  create(request: UserRequest): Observable<User> {
    return this.http.post<User>(`${this.apiUrl}/create-user`, request);
  }

  update(id: number, request: UserRequest): Observable<User> {
    return this.http.put<User>(`${this.apiUrl}/update-user/${id}`, request);
  }
}