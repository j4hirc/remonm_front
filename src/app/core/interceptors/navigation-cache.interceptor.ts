import { inject } from '@angular/core';
import {
    HttpContextToken,
    HttpEvent,
    HttpInterceptorFn,
    HttpResponse
} from '@angular/common/http';
import {
    Observable,
    finalize,
    of,
    shareReplay,
    tap
} from 'rxjs';

import { AuthService } from '../services/auth.service';
import { environment } from '../../../environments/environment';

export const NAVIGATION_CACHE =
    new HttpContextToken<boolean>(() => false);

const TTL = 30_000;

type CacheEntry = {
    response: HttpResponse<unknown>;
    expires: number;
};

const cache = new Map<string, CacheEntry>();

const pending =
    new Map<string, Observable<HttpEvent<unknown>>>();

let scope = '';
let revision = 0;

export const navigationCacheInterceptor: HttpInterceptorFn = (
    request,
    next
) => {
    const auth = inject(AuthService);

    const currentScope =
        `${auth.token() ?? ''}|${auth.activeRole() ?? ''}`;

    // No compartir datos entre sesiones o perfiles.
    if (scope !== currentScope) {
        scope = currentScope;
        revision++;
        cache.clear();
        pending.clear();
    }

    const api = environment.apiUrl.replace(/\/+$/, '');

    if (!request.url.startsWith(`${api}/`)) {
        return next(request);
    }

    const jobsUrl = `${api}/jobs/all`;
    const key = request.urlWithParams;

    // Una escritura invalida los datos anteriores.
    if (request.method !== 'GET') {
        const previous = cache.get(jobsUrl);
        const version = ++revision;

        cache.clear();
        pending.clear();

        return next(request).pipe(
            tap(event => {
                if (
                    !(event instanceof HttpResponse)
                    || scope !== currentScope
                ) {
                    return;
                }

                const canReuse = revision === version;

                revision++;
                cache.clear();
                pending.clear();

                if (!canReuse) return;

                const isJobSave =
                    (
                        request.method === 'POST'
                        && request.url === `${api}/jobs/create-job`
                    )
                    || (
                        request.method === 'PUT'
                        && request.url.startsWith(`${api}/jobs/update-job/`)
                    );

                const saved = event.body as {
                    jobId?: number;
                } | null;

                // Actualizar una lista completa reciente con la respuesta
                // confirmada por el backend.
                if (
                    isJobSave
                    && saved?.jobId != null
                    && previous
                    && previous.expires > Date.now()
                    && Array.isArray(previous.response.body)
                ) {
                    const rows = previous.response.body as {
                        jobId: number;
                    }[];

                    const body = rows.some(row => row.jobId === saved.jobId)
                        ? rows.map(row =>
                            row.jobId === saved.jobId ? saved : row
                        )
                        : [...rows, saved];

                    cache.set(jobsUrl, {
                        response: previous.response.clone({
                            body: structuredClone(body)
                        }),
                        expires: previous.expires
                    });
                }
            })
        );
    }

    const allowed = [
        jobsUrl,
        `${api}/user/all-users`,
        `${api}/materials/all`
    ];

    if (
        !auth.token()
        || !request.context.get(NAVIGATION_CACHE)
        || !allowed.includes(key)
    ) {
        return next(request);
    }

    const hit = cache.get(key);

    if (hit && hit.expires > Date.now()) {
        return of(
            hit.response.clone({
                body: structuredClone(hit.response.body)
            })
        );
    }

    const running = pending.get(key);

    if (running) return running;

    const version = revision;

    const response$ = next(request).pipe(
        tap(event => {
            if (
                event instanceof HttpResponse
                && version === revision
                && scope === currentScope
            ) {
                cache.set(key, {
                    response: event.clone({
                        body: structuredClone(event.body)
                    }),
                    expires: Date.now() + TTL
                });
            }
        }),
        finalize(() => {
            if (pending.get(key) === response$) {
                pending.delete(key);
            }
        }),
        shareReplay({
            bufferSize: 1,
            refCount: true
        })
    );

    pending.set(key, response$);

    return response$;
};