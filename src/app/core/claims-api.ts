
import { HttpClient, HttpEvent, HttpEventType, HttpHeaders, HttpParams } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { LosslessNumber, parse, stringify } from 'lossless-json';
import { catchError, defer, map, Observable, switchMap, tap, throwError } from 'rxjs';
import { ApiError } from './api-error';
import {
  AuditEntry, Cause, ClaimDetail, ClaimDocument, ClaimFilters, ClaimSummary, ClosureCheck, Coverage,
  CreateClaim, CreatedClaim, Credentials, DemoToken, FnolValidation, Identity, Ledger, NotesResult,
  OverrideResult, Page, Party, PartyInput, Policy, PolicyResult, ReserveChange, ReserveComponent,
  ReserveTransaction, StatusReference, StatusResult, Transition, UserReference,
} from './contracts';
import { Session } from './session';
import { apiBase } from './settings';

const monetaryFields = new Set([
  'amount', 'estimatedlossamount', 'previousbalance', 'newbalance', 'currentamount', 'pendingamount', 'totalreserves', 'balance',
]);
const fnolTimeoutMs = 30_000;
const userDirectoryTimeoutMs = 10_000;

export function encodeRequest(value: object): string {
  return stringify(value, (key, property) =>
    monetaryFields.has(key.toLowerCase()) && typeof property === 'string' ? new LosslessNumber(property) : property)!;
}

export function decodeResponse<T>(value: string): T {
  return parse(value, (key, property) =>
    property instanceof LosslessNumber
      ? monetaryFields.has(key.toLowerCase()) ? property.toString() : Number(property.toString())
      : property,
  ) as T;
}

@Injectable({ providedIn: 'root' })
export class ClaimsApi {
  private readonly http = inject(HttpClient);
  private readonly session = inject(Session);
  private readonly unresolved = new Map<string, string>();

  login(credentials: Credentials) { return this.json<DemoToken>('POST', '/auth/demo-token', credentials); }
  me() { return this.json<Identity>('GET', '/auth/me'); }
  causes() { return this.json<Cause[]>('GET', '/reference/cause-of-loss-codes'); }
  statuses() { return this.json<StatusReference[]>('GET', '/reference/claim-statuses'); }
  users() {
    return this.json<UserReference[]>('GET', '/reference/users', null, undefined, userDirectoryTimeoutMs);
  }

  policies(q: string) {
    return this.json<Policy[]>('GET', '/policies/search', null, new HttpParams().set('q', q));
  }

  coverage(id: string) { return this.json<Coverage>('GET', '/policies/' + id + '/coverage'); }

  list(filters: ClaimFilters, page: number, pageSize: number) {
    let params = this.pageParams(page, pageSize);
    for (const status of filters.status) params = params.append('status', status);
    for (const field of ['dateFrom', 'dateTo', 'assignedHandlerName', 'causeOfLossCode', 'search'] as const) {
      const value = filters[field].trim();
      if (value) params = params.set(field, value);
    }
    return this.json<Page<ClaimSummary>>('GET', '/claims', null, params);
  }

  validate(request: CreateClaim) {
    return this.json<FnolValidation>('POST', '/claims/validate', request, undefined, fnolTimeoutMs);
  }
  create(request: CreateClaim) { return this.write<CreatedClaim>('POST', '/claims', request, fnolTimeoutMs); }
  detail(id: string) { return this.json<ClaimDetail>('GET', '/claims/' + id); }
  closure(id: string) { return this.json<ClosureCheck>('GET', '/claims/' + id + '/closure-check'); }

  transition(id: string, request: Transition) {
    return this.write<StatusResult>('PUT', '/claims/' + id + '/status', request);
  }

  saveNotes(id: string, notes: string | null) {
    return this.write<NotesResult>('PUT', '/claims/' + id + '/notes', { notes });
  }

  linkPolicy(id: string, policyId: string, acknowledgePolicyPeriodWarning: boolean) {
    return this.write<PolicyResult>('PUT', '/claims/' + id + '/policy', { policyId, acknowledgePolicyPeriodWarning });
  }

  addParty(id: string, party: PartyInput) {
    return this.write<Party>('POST', '/claims/' + id + '/parties', party);
  }

  removeParty(id: string, partyId: string) {
    return this.write<void>('DELETE', '/claims/' + id + '/parties/' + partyId);
  }

  ledger(id: string) { return this.json<Ledger>('GET', '/claims/' + id + '/reserves'); }

  addReserve(id: string, component: ReserveComponent, change: ReserveChange) {
    return this.write<ReserveTransaction>('POST', '/claims/' + id + '/reserves', { component, ...change });
  }

  changeReserve(id: string, componentId: string, change: ReserveChange) {
    return this.write<ReserveTransaction>('PUT', '/claims/' + id + '/reserves/' + componentId, change);
  }

  reserveAction(id: string, transactionId: string, action: 'approve' | 'reject' | 'retract' | 'retry-posting',
      rejectionReason?: string) {
    return this.write<ReserveTransaction>(
      'POST', '/claims/' + id + '/reserves/' + transactionId + '/' + action,
      action === 'reject' ? { rejectionReason } : null,
    );
  }

  enableOverride(id: string, reason: string) {
    return this.write<OverrideResult>('PUT', '/claims/' + id + '/reserves/manager-override', { reason });
  }

  documents(id: string) { return this.json<ClaimDocument[]>('GET', '/claims/' + id + '/documents'); }

  upload(id: string, file: File, documentType: string, notes: string): Observable<HttpEvent<ClaimDocument>> {
    const path = '/claims/' + id + '/documents';
    return defer(async () => {
      const digest = await crypto.subtle.digest('SHA-256', await file.arrayBuffer());
      return Array.from(new Uint8Array(digest), value => value.toString(16).padStart(2, '0')).join('');
    }).pipe(switchMap(hash => {
      const body = new FormData();
      body.set('file', file);
      body.set('documentType', documentType);
      if (notes) body.set('notes', notes);
      return this.withWriteKey('POST', path, JSON.stringify([hash, file.name, file.type, documentType, notes]),
        headers => this.http.post<ClaimDocument>(apiBase + path, body, {
          headers, observe: 'events', reportProgress: true,
        }), event => event.type === HttpEventType.Response,
      );
    }));
  }

  downloadLocal(id: string, documentId: string) {
    return this.http.get(apiBase + '/claims/' + id + '/documents/' + documentId + '/download', {
      responseType: 'blob',
    });
  }

  audit(id: string, page: number, pageSize: number) {
    return this.json<Page<AuditEntry>>('GET', '/claims/' + id + '/audit', null, this.pageParams(page, pageSize));
  }

  private pageParams(page: number, pageSize: number) {
    return new HttpParams().set('page', page).set('pageSize', pageSize);
  }

  private json<T>(method: string, path: string, body: object | null = null,
      params?: HttpParams, timeout?: number): Observable<T> {
    return this.send<T>(method, path, body ? encodeRequest(body) : null, new HttpHeaders(), params, timeout);
  }

  private write<T>(method: string, path: string, body: object | null = null, timeout?: number): Observable<T> {
    const encoded = body ? encodeRequest(body) : null;
    return this.withWriteKey(method, path, encoded ?? '',
      headers => this.send<T>(method, path, encoded, headers, undefined, timeout));
  }

  private send<T>(method: string, path: string, body: string | null, headers: HttpHeaders,
      params?: HttpParams, timeout?: number) {
    return this.http.request(method, apiBase + path, {
      body,
      headers: body === null ? headers : headers.set('Content-Type', 'application/json'),
      params,
      timeout,
      responseType: 'text',
    }).pipe(map(value => value ? decodeResponse<T>(value) : undefined as T));
  }

  private withWriteKey<T>(method: string, path: string, fingerprint: string,
      send: (headers: HttpHeaders) => Observable<T>, completed: (value: T) => boolean = () => true): Observable<T> {
    return defer(() => {
      const actor = this.session.identity();
      const scope = JSON.stringify([actor?.organizationEntityId, actor?.userId, method, path, fingerprint]);
      let key = this.unresolved.get(scope);
      if (!key) {
        key = crypto.randomUUID();
        this.unresolved.set(scope, key);
      }
      return send(new HttpHeaders({ 'Idempotency-Key': key })).pipe(
        tap(value => { if (completed(value)) this.unresolved.delete(scope); }),
        catchError(error => {
          if (error instanceof ApiError && error.status > 0 && error.status < 500 &&
              ![401, 403, 408, 429].includes(error.status)) {
            this.unresolved.delete(scope);
          }
          return throwError(() => error);
        }),
      );
    });
  }
}




