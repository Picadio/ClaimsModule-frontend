
import { DatePipe } from '@angular/common';
import { Component, DestroyRef, inject, signal } from '@angular/core';
import { takeUntilDestroyed, toSignal } from '@angular/core/rxjs-interop';
import { MatButtonModule } from '@angular/material/button';
import { MatSnackBar } from '@angular/material/snack-bar';
import { MatTabsModule } from '@angular/material/tabs';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { BehaviorSubject, catchError, combineLatest, EMPTY, map, switchMap } from 'rxjs';
import { errorMessages } from '../../core/api-error';
import { ClaimsApi } from '../../core/claims-api';
import { ClaimDetail, StatusReference } from '../../core/contracts';
import { Session } from '../../core/session';
import { Feedback } from '../../shared/feedback';
import { Operation } from '../../shared/operation';
import { StatusChip } from '../../shared/status-chip';
import { AuditTab } from './audit-tab';
import { DocumentsTab } from './documents-tab';
import { Lifecycle } from './lifecycle';
import { OverviewTab } from './overview-tab';
import { PartiesTab } from './parties-tab';
import { ReservesTab } from './reserves-tab';

const tabs = ['overview', 'parties', 'reserves', 'documents', 'audit'];

@Component({
  imports: [
    RouterLink, DatePipe, MatButtonModule, MatTabsModule, Feedback, StatusChip, Lifecycle, OverviewTab,
    PartiesTab, ReservesTab, DocumentsTab, AuditTab,
  ],
  templateUrl: './claim-detail.html',
})
export class ClaimDetailPage {
  private readonly api = inject(ClaimsApi);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly snackbar = inject(MatSnackBar);
  private readonly refreshes = new BehaviorSubject(0);
  protected readonly session = inject(Session);
  protected readonly reference = new Operation();
  protected readonly userReference = new Operation();
  protected readonly statusReferences = signal<StatusReference[]>([]);
  protected readonly claim = signal<ClaimDetail | null>(null);
  protected readonly loading = signal(true);
  protected readonly errors = signal<string[]>([]);
  protected readonly created = this.router.currentNavigation()?.extras.state?.['created'] ?? window.history.state?.created;
  protected readonly query = toSignal(this.route.queryParamMap, { initialValue: this.route.snapshot.queryParamMap });

  constructor() {
    this.loadStatuses();
    this.loadUsers();
    combineLatest([this.route.paramMap.pipe(map(params => params.get('id')!)), this.refreshes]).pipe(
      switchMap(([id]) => {
        if (this.claim()?.id !== id) this.claim.set(null);
        this.loading.set(true);
        this.errors.set([]);
        return this.api.detail(id).pipe(catchError(error => {
          this.loading.set(false);
          this.errors.set(errorMessages(error));
          return EMPTY;
        }));
      }),
      takeUntilDestroyed(inject(DestroyRef)),
    ).subscribe(claim => {
      this.claim.set(claim);
      this.loading.set(false);
    });
  }

  protected loadStatuses(): void {
    this.reference.run(this.api.statuses(), statuses => this.statusReferences.set(statuses));
  }

  protected loadUsers(): void {
    const identity = this.session.identity();
    this.userReference.run(this.api.users(), users => this.session.setDirectory(identity, users));
  }

  protected refresh(): void {
    this.refreshes.next(this.refreshes.value + 1);
  }

  protected selectedTab(): number {
    return Math.max(0, tabs.indexOf(this.query().get('tab') ?? ''));
  }

  protected selectTab(index: number): void {
    if (index === this.selectedTab()) return;
    void this.router.navigate([], {
      relativeTo: this.route, queryParams: { tab: index ? tabs[index] : null }, replaceUrl: true,
    });
  }
  protected async copy(value: string): Promise<void> {
    try {
      await navigator.clipboard.writeText(value);
      this.snackbar.open('Claim number copied.', 'Dismiss', { duration: 2500 });
    } catch {
      this.snackbar.open('Could not copy the claim number.', 'Dismiss', { duration: 3500 });
    }
  }
}

