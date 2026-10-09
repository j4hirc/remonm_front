import { inject, Injectable } from '@angular/core';
import { HttpClient, HttpContext } from '@angular/common/http';
import { Observable, forkJoin, map } from 'rxjs';

import { NAVIGATION_CACHE } from '../interceptors/navigation-cache.interceptor';
import { environment } from '../../../environments/environment';
import { User, UserRequest } from '../models/user.model';

@Injectable({
  providedIn: 'root'
})
export class UsersService {
  private readonly http = inject(HttpClient);

  private readonly apiUrl = `${environment.apiUrl}/user`;

  getAll(useNavigationCache = false): Observable<User[]> {
    return this.http.get<User[]>(`${this.apiUrl}/all-users`, {
      context: new HttpContext().set(
        NAVIGATION_CACHE,
        useNavigationCache
      )
    });
  }

  getAllForManagement(): Observable<User[]> {
  return forkJoin({
    users: this.getAll(),
    unemployed: this.http.get<User[]>(
      `${this.apiUrl}/all-unemployed`
    )
  }).pipe(
    map(({ users, unemployed }) => {
      const uniqueUsers = new Map<number, User>();

      for (const user of [...users, ...unemployed]) {
        uniqueUsers.set(user.userId, user);
      }

      return [...uniqueUsers.values()];
    })
  );
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