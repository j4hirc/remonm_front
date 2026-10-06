import { inject } from '@angular/core';
import {
  HttpErrorResponse,
  HttpInterceptorFn
} from '@angular/common/http';
import { Router } from '@angular/router';
import { catchError, throwError } from 'rxjs';

import { environment } from '../../../environments/environment';
import { AuthService } from '../services/auth.service';

export const authInterceptor: HttpInterceptorFn = (request, next) => {
  const authService = inject(AuthService);
  const router = inject(Router);

  const apiUrl = environment.apiUrl.replace(/\/+$/, '');

  const belongsToApi =
    request.url === apiUrl ||
    request.url.startsWith(`${apiUrl}/`);

  const isAuthenticationRequest =
    request.url.startsWith(`${apiUrl}/auth/`);

  if (!belongsToApi || isAuthenticationRequest) {
    return next(request);
  }

  const token = authService.token();

  const authenticatedRequest =
    token && !request.headers.has('Authorization')
      ? request.clone({
          setHeaders: {
            Authorization: `Bearer ${token}`
          }
        })
      : request;

  return next(authenticatedRequest).pipe(
    catchError((error: unknown) => {
      if (
        error instanceof HttpErrorResponse &&
        error.status === 401 &&
        token &&
        authService.token() === token
      ) {
        authService.logout();
        void router.navigateByUrl('/login');
      }

      return throwError(() => error);
    })
  );
};