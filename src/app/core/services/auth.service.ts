import { computed, inject, Injectable, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, tap } from 'rxjs';

import { environment } from '../../../environments/environment';
import {
    AppRole,
    ForgotPasswordRequest,
    LoginRequest,
    LoginResponse
} from '../models/auth.model';

function isAppRole(value: unknown): value is AppRole {
    return (
        value === 'ROLE_ADMIN' ||
        value === 'ROLE_JEFE' ||
        value === 'ROLE_EMPLOYEE'
    );
}

@Injectable({
    providedIn: 'root'
})
export class AuthService {
    private readonly http = inject(HttpClient);

    private readonly authUrl = `${environment.apiUrl}/auth`;

    private readonly tokenState = signal<string | null>(null);
    private readonly emailState = signal<string | null>(null);
    private readonly rolesState = signal<readonly AppRole[]>([]);
    private readonly activeRoleState = signal<AppRole | null>(null);

    readonly token = this.tokenState.asReadonly();
    readonly email = this.emailState.asReadonly();
    readonly roles = this.rolesState.asReadonly();
    readonly activeRole = this.activeRoleState.asReadonly();

    // Indica que hay un token guardado.
    // Su validez real la comprueba el backend.
    readonly hasSession = computed(() => this.tokenState() !== null);

    constructor() {
        this.restoreSession();
    }

    login(credentials: LoginRequest): Observable<LoginResponse> {
        return this.http
            .post<LoginResponse>(`${this.authUrl}/login`, credentials)
            .pipe(
                tap((response) => {
                    this.saveSession(response);
                })
            );
    }

    forgotPassword(request: ForgotPasswordRequest): Observable<void> {
        return this.http.post<void>(
            `${this.authUrl}/forgot-password`,
            request
        );
    }

    selectRole(role: AppRole): boolean {
        if (!this.hasSession() || !this.rolesState().includes(role)) {
            return false;
        }

        localStorage.setItem('active_role', role);
        this.activeRoleState.set(role);

        return true;
    }

    logout(): void {
        localStorage.removeItem('jwt_token');
        localStorage.removeItem('user_email');
        localStorage.removeItem('user_roles');
        localStorage.removeItem('active_role');

        this.tokenState.set(null);
        this.emailState.set(null);
        this.rolesState.set([]);
        this.activeRoleState.set(null);
    }

    private saveSession(response: LoginResponse): void {
        const roles = [...new Set(response.roles.filter(isAppRole))];

        // Un único perfil se selecciona automáticamente.
        // Con varios perfiles, el usuario deberá elegir.
        const activeRole = roles.length === 1 ? roles[0] : null;

        localStorage.setItem('jwt_token', response.accessToken);
        localStorage.setItem('user_email', response.email);
        localStorage.setItem('user_roles', JSON.stringify(roles));

        if (activeRole !== null) {
            localStorage.setItem('active_role', activeRole);
        } else {
            localStorage.removeItem('active_role');
        }

        this.tokenState.set(response.accessToken);
        this.emailState.set(response.email);
        this.rolesState.set(roles);
        this.activeRoleState.set(activeRole);
    }

    private restoreSession(): void {
        try {
            const token = localStorage.getItem('jwt_token');
            const email = localStorage.getItem('user_email');
            const storedRoles = localStorage.getItem('user_roles');
            const storedActiveRole = localStorage.getItem('active_role');

            if (!token || !email || !storedRoles) {
                this.logout();
                return;
            }

            const parsedRoles: unknown = JSON.parse(storedRoles);

            if (!Array.isArray(parsedRoles)) {
                this.logout();
                return;
            }

            const roleValues: unknown[] = parsedRoles;
            const roles = [...new Set(roleValues.filter(isAppRole))];

            const activeRole =
                isAppRole(storedActiveRole) && roles.includes(storedActiveRole)
                    ? storedActiveRole
                    : null;

            this.tokenState.set(token);
            this.emailState.set(email);
            this.rolesState.set(roles);
            this.activeRoleState.set(activeRole);
        } catch {
            // Descarta una sesión cuyo contenido guardado no se pueda leer.
            this.logout();
        }
    }
}