import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';

import { AuthService } from '../services/auth.service';
import { AppRole } from '../models/auth.model';

function isAppRole(value: unknown): value is AppRole {
  return (
    value === 'ROLE_ADMIN' ||
    value === 'ROLE_JEFE' ||
    value === 'ROLE_EMPLOYEE' ||
    value === 'ROLE_BODEGUERO'
  );
}

export const authGuard: CanActivateFn = () => {
  const authService = inject(AuthService);
  const router = inject(Router);

  return authService.hasSession()
    ? true
    : router.createUrlTree(['/auth/login']);
};

export const roleGuard: CanActivateFn = (route) => {
  const authService = inject(AuthService);
  const router = inject(Router);

  if (!authService.hasSession()) {
    return router.createUrlTree(['/auth/login']);
  }

  const requiredRole: unknown = route.data['role'];

  if (
    isAppRole(requiredRole) &&
    authService.roles().includes(requiredRole) &&
    authService.activeRole() === requiredRole
  ) {
    return true;
  }

  return router.createUrlTree(['/auth/role-selector']);
};