
import { DatePipe, JsonPipe } from '@angular/common';
import { Component, inject, input, OnInit, signal } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatPaginatorModule, PageEvent } from '@angular/material/paginator';
import { RouterLink } from '@angular/router';
import { ClaimsApi } from '../../core/claims-api';
import { AuditEntry, Page } from '../../core/contracts';
import { Session } from '../../core/session';
import { Feedback } from '../../shared/feedback';
import { Operation } from '../../shared/operation';

@Component({
  selector: 'app-audit-tab',
  imports: [DatePipe, JsonPipe, RouterLink, MatButtonModule, MatPaginatorModule, Feedback],
  template: `
    <section class="tab-body">
      <div class="section-title"><h2>Audit Log</h2><button mat-button [disabled]="loading.pending()" (click)="refresh()">Refresh audit</button></div>
      <app-feedback [loading]="loading.pending()" [errors]="loading.errors()" />
      @if (events(); as result) {
        <div class="table-frame">
          <table>
            <caption class="visually-hidden">Claim audit events, newest first</caption>
            <thead><tr><th>Timestamp (UTC)</th><th>Event</th><th>Description</th><th>Actor</th><th>Related record</th></tr></thead>
            <tbody>
              @for (entry of result.items; track entry.id) {
                <tr>
                  <td>{{ entry.createdAt | date:'medium':'UTC' }}</td>
                  <td><span class="badge audit-badge">{{ entry.eventType }}</span></td>
                  <td>{{ entry.description }}
                    <details>
                      <summary>Event details</summary>
                      <div class="muted">Correlation ID {{ entry.correlationId }}</div>
                      @if (entry.oldValues !== null) { <div>Previous <pre>{{ entry.oldValues | json }}</pre></div> }
                      @if (entry.newValues !== null) { <div>New <pre>{{ entry.newValues | json }}</pre></div> }
                    </details>
                  </td>
                  <td>{{ session.actorName(entry.actorId, 'System') }}</td>
                  <td>
                    @if (relatedTab(entry); as tab) {
                      <a [routerLink]="['/claims', claimId()]" [queryParams]="{ tab, related: entry.relatedEntityId }">{{ label(entry) }}</a>
                    } @else { {{ label(entry) }} }
                  </td>
                </tr>
              } @empty { <tr><td colspan="5">No audit events found.</td></tr> }
            </tbody>
          </table>
          <mat-paginator aria-label="Audit pagination" [disabled]="loading.pending()" [length]="result.totalCount"
            [pageIndex]="result.page - 1" [pageSize]="result.pageSize" [pageSizeOptions]="[10, 20, 50, 100]"
            [showFirstLastButtons]="true" (page)="paginate($event)" />
        </div>
      }
    </section>
  `,
})
export class AuditTab implements OnInit {
  readonly claimId = input.required<string>();
  private readonly api = inject(ClaimsApi);
  protected readonly session = inject(Session);
  protected readonly loading = new Operation();
  protected readonly events = signal<Page<AuditEntry> | null>(null);
  private page = 1;
  private pageSize = 20;

  ngOnInit(): void {
    this.refresh();
  }

  protected refresh(): void {
    this.loading.run(this.api.audit(this.claimId(), this.page, this.pageSize), events => this.events.set(events));
  }

  protected paginate(event: PageEvent): void {
    this.page = event.pageIndex + 1;
    this.pageSize = event.pageSize;
    this.refresh();
  }

  protected relatedTab(entry: AuditEntry): string | null {
    if (!entry.relatedEntityId) return null;
    switch (entry.relatedEntityType) {
      case 'ClaimParty': return 'parties';
      case 'ReserveHistory': return 'reserves';
      case 'ClaimDocument': return 'documents';
      default: return null;
    }
  }

  protected label(entry: AuditEntry): string {
    switch (entry.relatedEntityType) {
      case 'ClaimParty': return 'Party';
      case 'ReserveHistory': return 'Reserve transaction';
      case 'ClaimDocument': return 'Document';
      default: return entry.relatedEntityType ?? '—';
    }
  }
}
