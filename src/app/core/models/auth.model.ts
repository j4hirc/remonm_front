/**
 * Perfiles reconocidos por el frontend.
 */
export type AppRole =
    | 'ROLE_ADMIN'
    | 'ROLE_JEFE'
    | 'ROLE_EMPLOYEE'
    | 'ROLE_BODEGUERO';

/**
 * Datos enviados a POST /auth/login.
 */
export interface LoginRequest {
    email: string;
    password: string;
}

/**
 * Respuesta del backend al iniciar sesión.
 */
export interface LoginResponse {
    accessToken: string;
    tokenType: string;
    email: string;
    roles: string[];
}

/**
 * Datos enviados a POST /auth/forgot-password.
 */
export interface ForgotPasswordRequest {
    email: string;
}