import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  HostListener,
  inject,
  signal
} from '@angular/core';
import { HttpErrorResponse } from '@angular/common/http';
import {
  FormBuilder,
  ReactiveFormsModule,
  Validators
} from '@angular/forms';
import { Router } from '@angular/router';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { finalize, Subject, debounceTime } from 'rxjs';
import Swal from 'sweetalert2';

import { AuthService } from '../../core/services/auth.service';
import { AppRole } from '../../core/models/auth.model';

interface BackgroundTriangle {
  id: number;
  points: string;
  color: string;
  minimumOpacity: number;
  maximumOpacity: number;
  duration: string;
  delay: string;
}

@Component({
  selector: 'app-login',
  standalone: true,
  imports: [ReactiveFormsModule],
  templateUrl: './login.component.html',
  styleUrl: './login.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class LoginComponent {
  private readonly formBuilder = inject(FormBuilder);
  private readonly authService = inject(AuthService);
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);

  readonly isSubmitting = signal(false);
  readonly isRecoveringPassword = signal(false);
  readonly showPassword = signal(false);

  readonly loginForm = this.formBuilder.nonNullable.group({
    email: ['', [Validators.required, Validators.email]],
    password: ['', Validators.required]
  });

  private readonly dashboardRoutes: Record<AppRole, string> = {
    ROLE_ADMIN: '/admin/dashboard',
    ROLE_JEFE: '/jefe/dashboard',
    ROLE_EMPLOYEE: '/employee/dashboard',
    ROLE_BODEGUERO: '/bodeguero/bodega'
  };

  private readonly resize$ = new Subject<void>();

  constructor() {
    this.resize$
      .pipe(debounceTime(200), takeUntilDestroyed(this.destroyRef))
      .subscribe(() => {
        this.backgroundTriangles.set(this.createBackgroundTriangles());
      });
  }

  togglePassword(): void {
    this.showPassword.update((visible) => !visible);
  }

  submitLogin(): void {
    if (this.isSubmitting() || this.isRecoveringPassword()) {
      return;
    }

    const email = this.loginForm.controls.email.value.trim();
    this.loginForm.controls.email.setValue(email);
    this.loginForm.markAllAsTouched();

    if (this.loginForm.invalid) {
      void Swal.fire({
        icon: 'warning',
        title: 'Revisa tus datos',
        text: 'Ingresa un correo válido y tu contraseña.',
        confirmButtonColor: '#12CFF4'
      });
      return;
    }

    this.isSubmitting.set(true);

    this.authService
      .login(this.loginForm.getRawValue())
      .pipe(
        takeUntilDestroyed(this.destroyRef),
        finalize(() => this.isSubmitting.set(false))
      )
      .subscribe({
        next: () => this.handleSuccessfulLogin(),
        error: (error: unknown) => this.showLoginError(error)
      });
  }

  async recoverPassword(): Promise<void> {
    if (this.isSubmitting() || this.isRecoveringPassword()) {
      return;
    }

    this.isRecoveringPassword.set(true);

    try {
      const result = await Swal.fire<string>({
        title: 'Recuperar Contraseña',
        input: 'email',
        inputLabel: 'Ingresa tu correo electrónico registrado',
        inputPlaceholder: 'ejemplo@correo.com',
        inputValue: this.loginForm.controls.email.value.trim(),
        showCancelButton: true,
        confirmButtonText: 'Enviar',
        cancelButtonText: 'Cancelar',
        confirmButtonColor: '#12CFF4',
        cancelButtonColor: '#2E3238',
        showLoaderOnConfirm: true,
        allowOutsideClick: () => !Swal.isLoading(),
        allowEscapeKey: () => !Swal.isLoading(),

        inputValidator: (value: string) => {
          if (!value.trim()) {
            return 'Ingresa tu correo electrónico.';
          }

          return null;
        },

        preConfirm: async (value: string) => {
          const { firstValueFrom } = await import('rxjs');

          try {
            await firstValueFrom(
              this.authService.forgotPassword({
                email: value.trim()
              })
            );

            return value.trim();
          } catch {
            Swal.showValidationMessage(
              'No se pudo enviar el correo. Verifica tus datos e intenta de nuevo.'
            );
            return false;
          }
        }
      });

      if (result.isConfirmed) {
        await Swal.fire({
          icon: 'success',
          title: '¡Correo enviado!',
          text: 'Revisa tu bandeja de entrada o la carpeta de SPAM.',
          confirmButtonColor: '#12CFF4'
        });
      }
    } finally {
      this.isRecoveringPassword.set(false);
    }
  }

  readonly backgroundTriangles = signal<BackgroundTriangle[]>(
    this.createBackgroundTriangles()
  );

  @HostListener('window:resize')
  onWindowResize(): void {
    this.resize$.next();
  }

  private createBackgroundTriangles(): BackgroundTriangle[] {
    if (typeof window === 'undefined') {
      return [];
    }

    const width = window.innerWidth;
    const height = window.innerHeight;

    const palette = [
      '#12CFF4',
      '#F4A300',
      '#c8eef7',
      '#fde8b0',
      '#dde8ed',
      '#e8f4fb'
    ];

    // Celdas más grandes = muchos menos triángulos y elementos animados.
    const columns = Math.ceil(width / 220) + 1;
    const rows = Math.ceil(height / 200) + 1;

    const cellWidth = width / (columns - 1);
    const cellHeight = height / (rows - 1);

    const triangles: BackgroundTriangle[] = [];

    const jitter = (): number =>
      (Math.random() - 0.5) * cellWidth * 0.45;

    const addTriangle = (points: string): void => {
      const opacity = 0.06 + Math.random() * 0.12;
      const speed = 0.00012 + Math.random() * 0.00025;

      const duration = (Math.PI * 2) / (speed * 3600);

      triangles.push({
        id: triangles.length,
        points,
        color: palette[Math.floor(Math.random() * palette.length)],
        minimumOpacity: Math.max(0.03, opacity - 0.04),
        maximumOpacity: opacity + 0.04,
        duration: `${duration}s`,
        delay: `${-Math.random() * duration}s`
      });
    };

    for (let row = 0; row < rows; row++) {
      for (let column = 0; column < columns; column++) {
        const x = column * cellWidth;
        const y = row * cellHeight;

        addTriangle(
          [
            `${x + jitter()},${y + jitter()}`,
            `${x + cellWidth + jitter()},${y + jitter()}`,
            `${x + jitter()},${y + cellHeight + jitter()}`
          ].join(' ')
        );

        addTriangle(
          [
            `${x + cellWidth + jitter()},${y + jitter()}`,
            `${x + cellWidth + jitter()},${y + cellHeight + jitter()}`,
            `${x + jitter()},${y + cellHeight + jitter()}`
          ].join(' ')
        );
      }
    }

    return triangles;
  }

  private handleSuccessfulLogin(): void {
    const roles = this.authService.roles();

    if (roles.length === 0) {
      this.authService.logout();

      void Swal.fire({
        icon: 'warning',
        title: 'Sin accesos',
        text: 'Tu usuario no tiene un perfil habilitado para este sistema.',
        confirmButtonColor: '#12CFF4'
      });
      return;
    }

    if (roles.length > 1) {
      void this.router.navigateByUrl('/auth/role-selector');
      return;
    }

    const activeRole = this.authService.activeRole();

    if (activeRole !== null) {
      void this.router.navigateByUrl(
        this.dashboardRoutes[activeRole]
      );
    }
  }

  private showLoginError(error: unknown): void {
    let title = 'No se pudo iniciar sesión';
    let text = 'Ocurrió un error. Intenta nuevamente.';

    if (error instanceof HttpErrorResponse) {
      if (error.status === 0) {
        title = 'Error de conexión';
        text = 'No se pudo conectar con el servidor.';
      } else if (error.status === 401 || error.status === 403) {
        title = 'Acceso denegado';
        text = 'Correo o contraseña incorrectos, o acceso no autorizado.';
      } else if (error.status >= 500) {
        title = 'Error del servidor';
        text = 'El servidor no pudo procesar la solicitud. Intenta más tarde.';
      }
    }

    void Swal.fire({
      icon: 'error',
      title,
      text,
      confirmButtonColor: '#12CFF4'
    });
  }
}