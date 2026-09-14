import { inject } from '@angular/core';
import { HttpInterceptorFn } from '@angular/common/http';

import { environment } from '../../../environments/environment';
import { AuthService } from '../services/auth.service';

export const authInterceptor: HttpInterceptorFn = (request, next) => {
  const authService = inject(AuthService);

  const apiUrl = environment.apiUrl.replace(/\/+$/, '');
  const belongsToApi =
    request.url === apiUrl ||
    request.url.startsWith(`${apiUrl}/`);

  const isAuthenticationRequest =
    request.url.startsWith(`${apiUrl}/auth/`);

  const token = authService.token();

  if (
    !belongsToApi ||
    isAuthenticationRequest ||
    !token ||
    request.headers.has('Authorization')
  ) {
    return next(request);
  }

  return next(
    request.clone({
      setHeaders: {
        Authorization: `Bearer ${token}`
      }
    })
  );
};