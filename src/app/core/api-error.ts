
import { HttpErrorResponse, HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { MatSnackBar } from '@angular/material/snack-bar';
import { Router } from '@angular/router';
import { catchError, from, mergeMap, throwError } from 'rxjs';
import { apiBase, isApiUrl } from './settings';
import { Session } from './session';

interface Problem {
  title?: string;
  detail?: string;
  errors?: Record<string, string[]>;
  correlationId?: string;
}

export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
    readonly fields: Record<string, string[]>,
    readonly correlationId: string | null,
  ) {
    super(message);
  }
}

export const apiInterceptor: HttpInterceptorFn = (request, next) => {
  if (!isApiUrl(request.url)) return next(request);
  const session = inject(Session);
  const router = inject(Router);
  const snackbar = inject(MatSnackBar);
  const login = request.url === apiBase + '/auth/demo-token';
  const registration = request.url === apiBase + '/auth/register';
  const token = login || registration ? null : session.token;
  const authorized = token ? request.clone({ setHeaders: { Authorization: 'Bearer ' + token } }) : request;

  return next(authorized).pipe(catchError((error: HttpErrorResponse) =>
    from(readProblem(error.error)).pipe(mergeMap(problem => {
      const correlation = error.headers.get('X-Correlation-ID') ?? problem.correlationId ?? null;
      const timedOut = error.error instanceof DOMException && error.error.name === 'TimeoutError';
      const status = timedOut ? 0 : error.status;
      const expired = status === 401 && !login;
      if (expired && token && token === session.token) {
        session.end();
        if (!router.url.startsWith('/login')) {
          void router.navigate(['/login'], { queryParams: { returnTo: router.url } });
        }
      }
      const fallback: Record<number, string> = {
        0: timedOut ? 'The request timed out. Try again.' : 'The API could not be reached.',
        401: login ? 'The username or password is incorrect.' : 'Sign in to continue.',
        403: 'Your role does not have permission for this action.',
        404: login ? 'Demo sign-in is unavailable.' : registration ? 'Demo registration is unavailable.' : 'The requested record was not found.',
        409: 'The record changed. Refresh it before trying again.',
        413: 'The selected file exceeds the upload limit.',
        422: 'Review the highlighted validation errors.',
        429: 'Too many attempts. Wait before trying again.',
      };
      const message = problem.detail || fallback[status] || problem.title || 'The request failed.';
      const apiError = new ApiError(status, message, problem.errors ?? {}, correlation);
      snackbar.open(correlation ? message + ' Reference: ' + correlation : message, 'Dismiss', { duration: 8000 });
      return throwError(() => apiError);
    })),
  ));
};

async function readProblem(value: unknown): Promise<Problem> {
  try {
    if (value instanceof Blob) value = await value.text();
    if (typeof value === 'string') value = JSON.parse(value);
    return value && typeof value === 'object' ? value as Problem : {};
  } catch {
    return {};
  }
}

export function errorMessages(error: unknown): string[] {
  if (error instanceof ApiError) {
    const issues = Object.entries(error.fields).flatMap(([field, messages]) =>
      messages.map(message => field + ': ' + message));
    return issues.length ? issues : [error.message];
  }
  return [error instanceof Error ? error.message : 'The request failed.'];
}
