import {
    ApplicationRef,
    Component,
    DestroyRef,
    PLATFORM_ID,
    inject,
    signal
} from '@angular/core';

import { isPlatformBrowser } from '@angular/common';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { SwUpdate } from '@angular/service-worker';

import {
    exhaustMap,
    filter,
    fromEvent,
    switchMap,
    take,
    timer
} from 'rxjs';

interface InstallChoice {
    outcome: 'accepted' | 'dismissed';
    platform: string;
}

interface BeforeInstallPromptEvent extends Event {
    readonly platforms: string[];
    readonly userChoice: Promise<InstallChoice>;
    prompt(): Promise<InstallChoice>;
}

@Component({
    selector: 'app-pwa',
    standalone: true,
    template: `
    <div class="pwa-panel">
      @if (updateAvailable()) {
        <section
          class="update-card"
          role="status"
          aria-live="polite"
        >
          <strong>Nueva versión disponible</strong>

          <p>
            Guarda los cambios pendientes y recarga
            para actualizar RemoMN.
          </p>

          <button type="button" (click)="reloadApp()">
            Recargar y actualizar
          </button>
        </section>
      }


      @if (installError()) {
        <p class="error-message" role="alert">
          {{ installError() }}
        </p>
      }
    </div>
  `,
    styles: [`
    :host {
      position: fixed;
      right: 16px;
      bottom: 16px;
      z-index: 1000;
      max-width: calc(100vw - 32px);
    }

    .pwa-panel {
      display: flex;
      flex-direction: column;
      align-items: flex-end;
      gap: 12px;
    }

    button {
      padding: 12px 18px;
      border: 0;
      border-radius: 10px;
      background: #e65100;
      color: white;
      font: inherit;
      font-weight: 600;
      cursor: pointer;
    }

    button:disabled {
      opacity: .65;
      cursor: wait;
    }

    button:focus-visible {
      outline: 3px solid #12cff4;
      outline-offset: 3px;
    }

    .install-button {
      box-shadow: 0 4px 16px rgb(0 0 0 / 20%);
    }

    .update-card {
      width: 320px;
      max-width: 100%;
      box-sizing: border-box;
      padding: 18px;
      border: 1px solid #dedede;
      border-radius: 14px;
      background: white;
      color: #252525;
      box-shadow: 0 6px 24px rgb(0 0 0 / 18%);
    }

    .update-card p {
      margin: 10px 0 16px;
      line-height: 1.5;
    }

    .error-message {
      max-width: 320px;
      margin: 0;
      padding: 12px;
      border-radius: 10px;
      background: #fff1f0;
      color: #a31515;
    }
  `]
})
export class PwaComponent {
    private readonly appRef = inject(ApplicationRef);
    private readonly updates = inject(SwUpdate);
    private readonly destroyRef = inject(DestroyRef);
    private readonly platformId = inject(PLATFORM_ID);

    private deferredPrompt: BeforeInstallPromptEvent | null = null;

    readonly canInstall = signal(false);
    readonly installing = signal(false);
    readonly installError = signal('');
    readonly updateAvailable = signal(false);

    constructor() {
        if (!isPlatformBrowser(this.platformId)) {
            return;
        }

        this.listenForInstallation();
        this.listenForUpdates();
    }

    private listenForInstallation(): void {
        fromEvent<Event>(window, 'beforeinstallprompt')
            .pipe(takeUntilDestroyed(this.destroyRef))
            .subscribe((event) => {
                event.preventDefault();

                this.deferredPrompt = event as BeforeInstallPromptEvent;
                this.installError.set('');
                this.canInstall.set(true);
            });

        fromEvent<Event>(window, 'appinstalled')
            .pipe(takeUntilDestroyed(this.destroyRef))
            .subscribe(() => {
                this.deferredPrompt = null;
                this.canInstall.set(false);
                this.installError.set('');
            });
    }

    async installApp(): Promise<void> {
        const promptEvent = this.deferredPrompt;

        if (!promptEvent || this.installing()) {
            return;
        }

        this.installing.set(true);
        this.installError.set('');

        try {
            // Se llama directamente desde el clic del usuario.
            await promptEvent.prompt();

            const choice = await promptEvent.userChoice;

            if (choice.outcome === 'accepted') {
                this.canInstall.set(false);
            }
        } catch (error: unknown) {
            console.error('No se pudo abrir la instalación:', error);

            this.installError.set(
                'No se pudo abrir la instalación. Intenta desde el menú del navegador.'
            );
        } finally {
            // Cada evento solo puede utilizarse una vez.
            // Para reintentar, el navegador debe emitir otro.
            this.deferredPrompt = null;
            this.canInstall.set(false);
            this.installing.set(false);
        }
    }

    private listenForUpdates(): void {
        if (!this.updates.isEnabled) {
            return;
        }

        this.updates.versionUpdates
            .pipe(takeUntilDestroyed(this.destroyRef))
            .subscribe((event) => {
                if (event.type === 'VERSION_READY') {
                    this.updateAvailable.set(true);
                }

                if (event.type === 'VERSION_INSTALLATION_FAILED') {
                    console.error(
                        'No se pudo descargar la nueva versión:',
                        event.error
                    );
                }
            });

        // Primero esperamos que Angular termine de estabilizarse.
        // Después comprobamos al inicio y cada 5 minutos.
        this.appRef.isStable
            .pipe(
                filter((stable) => stable),
                take(1),
                switchMap(() => timer(0, 5 * 60 * 1000)),
                exhaustMap(() => this.checkForUpdates()),
                takeUntilDestroyed(this.destroyRef)
            )
            .subscribe();
    }

    private async checkForUpdates(): Promise<void> {
        if (!navigator.onLine) {
            return;
        }

        try {
            await this.updates.checkForUpdate();
        } catch (error: unknown) {
            console.warn(
                'No se pudo comprobar si hay actualizaciones:',
                error
            );
        }
    }

    reloadApp(): void {
        window.location.reload();
    }
}