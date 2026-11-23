
import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { MatSnackBar } from '@angular/material/snack-bar';
import { provideRouter, Router } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { ApiError, apiInterceptor } from './api-error';
import { ClaimsApi } from './claims-api';
import { CreateClaim } from './contracts';
import { Session } from './session';

// HttpTestingController takes a ProgressEvent, while Angular's XHR backend emits a DOMException on timeout.
const xhrTimeout = () => new DOMException('Request timed out', 'TimeoutError') as unknown as ProgressEvent;

describe('Claims API contract', () => {
  let api: ClaimsApi;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [
      provideRouter([]),
      provideHttpClient(withInterceptors([apiInterceptor])),
      provideHttpClientTesting(),
      { provide: MatSnackBar, useValue: { open: () => undefined } },
    ] });
    api = TestBed.inject(ClaimsApi);
    http = TestBed.inject(HttpTestingController);
    const session = TestBed.inject(Session);
    session.start('test-token');
    session.identify({ userId: 'actor', organizationEntityId: 'org', role: 'handler' }, 'handler');
  });

  afterEach(() => http.verify());

  it('uses repeated status filters and attaches the API token', async () => {
    const result = firstValueFrom(api.list({
      status: ['Draft', 'Open'], dateFrom: '2025-01-01', dateTo: '',
      assignedHandlerName: ' hand ', search: '', causeOfLossCode: 'COL-FIRE',
    }, 2, 20));
    const request = http.expectOne(req => req.url === '/api/claims');
    expect(request.request.headers.get('Authorization')).toBe('Bearer test-token');
    expect(request.request.params.getAll('status')).toEqual(['Draft', 'Open']);
    expect(request.request.params.get('assignedHandlerName')).toBe('hand');
    expect(request.request.params.get('page')).toBe('2');
    request.flush('{"items":[],"page":2,"pageSize":20,"totalCount":0}');
    expect((await result).items).toEqual([]);
  });

  it.each([401, 403])('keeps the key after an ambiguous failure followed by %i', async status => {
    const router = TestBed.inject(Router);
    const navigate = vi.spyOn(router, 'navigate').mockResolvedValue(true);
    const first = firstValueFrom(api.saveNotes('claim', 'Updated')).catch(error => error);
    const original = http.expectOne('/api/claims/claim/notes');
    const key = original.request.headers.get('Idempotency-Key');
    expect(key).toBeTruthy();
    original.error(new ProgressEvent('error'));
    expect(await first).toBeInstanceOf(ApiError);

    const denied = firstValueFrom(api.saveNotes('claim', 'Updated')).catch(error => error);
    const unauthorized = http.expectOne('/api/claims/claim/notes');
    expect(unauthorized.request.headers.get('Idempotency-Key')).toBe(key);
    unauthorized.flush('{}', { status, statusText: 'Access denied' });
    expect(await denied).toBeInstanceOf(ApiError);
    expect(navigate).toHaveBeenCalledTimes(status === 401 ? 1 : 0);

    const session = TestBed.inject(Session);
    session.start('renewed-test-token');
    session.identify({ userId: 'actor', organizationEntityId: 'org', role: 'handler' }, 'handler');
    const second = firstValueFrom(api.saveNotes('claim', 'Updated'));
    const retry = http.expectOne('/api/claims/claim/notes');
    expect(retry.request.method).toBe('PUT');
    expect(retry.request.headers.get('Authorization')).toBe('Bearer renewed-test-token');
    expect(retry.request.headers.get('Idempotency-Key')).toBe(key);
    retry.flush('{"claimId":"claim","notes":"Updated"}');
    expect((await second).notes).toBe('Updated');

    const third = firstValueFrom(api.saveNotes('claim', 'Updated'));
    const next = http.expectOne('/api/claims/claim/notes');
    expect(next.request.headers.get('Idempotency-Key')).not.toBe(key);
    next.flush('{"claimId":"claim","notes":"Updated"}');
    await third;
  });

  it('uses a transaction ID for approval and preserves correlation on validation errors', async () => {
    const result = firstValueFrom(api.reserveAction('claim', 'txn', 'approve')).catch(error => error);
    const request = http.expectOne('/api/claims/claim/reserves/txn/approve');
    expect(request.request.method).toBe('POST');
    request.flush('{"type":"ValidationError","errors":{"Amount":["Override required."]}}', {
      status: 422, statusText: 'Unprocessable Entity', headers: { 'X-Correlation-ID': 'test-reference' },
    });
    const error = await result;
    expect(error).toBeInstanceOf(ApiError);
    expect(error.fields).toEqual({ Amount: ['Override required.'] });
    expect(error.correlationId).toBe('test-reference');
  });

  it('reads correlation from problem details when the browser cannot read the response header', async () => {
    const result = firstValueFrom(api.reserveAction('claim', 'txn', 'approve')).catch(error => error);
    http.expectOne('/api/claims/claim/reserves/txn/approve').flush('{"correlationId":"body-reference"}', {
      status: 422, statusText: 'Unprocessable Entity',
    });
    expect((await result).correlationId).toBe('body-reference');
  });

  it.each([0, 201])('bounds FNOL requests and preserves the create key after a timeout with status %i', async status => {
    const claim: CreateClaim = {
      policyId: null, claimType: 'Property', severity: 'Standard',
      lossEvent: {
        lossDate: '2025-06-02T10:00:00Z', causeOfLossCode: 'COL-FIRE', lossDescription: 'Synthetic property damage',
        lossLocation: null, estimatedLossAmount: null, policeReportNumber: null,
      },
      parties: [], riskObjects: [], initialReserve: null,
    };
    const validation = firstValueFrom(api.validate(claim));
    const preview = http.expectOne('/api/claims/validate');
    expect(preview.request.timeout).toBe(30_000);
    preview.flush('{"warnings":[]}');
    await validation;

    const first = firstValueFrom(api.create(claim)).catch(error => error);
    const original = http.expectOne('/api/claims');
    const key = original.request.headers.get('Idempotency-Key');
    expect(original.request.timeout).toBe(30_000);
    expect(key).toBeTruthy();
    original.error(xhrTimeout(), { status });
    expect(await first).toMatchObject({ status: 0, message: 'The request timed out. Try again.' });

    const second = firstValueFrom(api.create(claim));
    const retry = http.expectOne('/api/claims');
    expect(retry.request.headers.get('Idempotency-Key')).toBe(key);
    retry.flush('{"id":"created","warnings":[]}', { status: 201, statusText: 'Created' });
    expect((await second).id).toBe('created');
  });

  it('bounds the user directory request so a failure can enable retry and fallback', async () => {
    const result = firstValueFrom(api.users()).catch(error => error);
    const request = http.expectOne('/api/reference/users');
    expect(request.request.timeout).toBe(10_000);
    request.error(xhrTimeout());
    expect(await result).toMatchObject({ status: 0, message: 'The request timed out. Try again.' });
  });

  it('discards user directory results from a previous session', () => {
    const session = TestBed.inject(Session);
    const previous = session.identity();
    const users = [{ userId: 'another-handler', displayName: 'Another handler', role: 'handler' as const }];
    session.setDirectory(previous, users);
    expect(session.actorName('another-handler')).toBe('Another handler');
    session.end();
    expect(session.directory()).toBeNull();
    session.start('test-token');
    session.identify({ userId: 'actor', organizationEntityId: 'org', role: 'handler' }, 'handler');
    session.setDirectory(previous, users);
    expect(session.directory()).toBeNull();
    expect(session.actorName('another-handler')).toBe('another-handler');
  });
});

