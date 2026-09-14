import {
  ApplicationConfig,
  provideBrowserGlobalErrorListeners
} from '@angular/core';
import {
  provideHttpClient,
  withInterceptors
} from '@angular/common/http';
import { provideRouter } from '@angular/router';
import { provideSweetAlert2 } from '@sweetalert2/ngx-sweetalert2';

import { routes } from './app.routes';
import { authInterceptor } from './core/interceptors/auth.interceptor';

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideHttpClient(
      withInterceptors([authInterceptor])
    ),
    provideRouter(routes),
    provideSweetAlert2({
      fireOnInit: false,
      dismissOnDestroy: true
    })
  ]
};