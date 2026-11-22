
import { DatePipe } from '@angular/common';
import { Component, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatPaginatorModule, PageEvent } from '@angular/material/paginator';
import { MatSelectModule } from '@angular/material/select';
import { Router, RouterLink } from '@angular/router';
import { ClaimsApi } from '../core/claims-api';
import { Cause, ClaimFilters, ClaimSummary, Page, Status, statuses } from '../core/contracts';
import { MoneyPipe } from '../core/money';
import { Feedback } from '../shared/feedback';
import { Operation } from '../shared/operation';
import { StatusChip } from '../shared/status-chip';

@Component({
  imports: [
    DatePipe, ReactiveFormsModule, MatButtonModule, MatFormFieldModule, MatInputModule, MatSelectModule,
    MatPaginatorModule, RouterLink, MoneyPipe, Feedback, StatusChip,
  ],
  templateUrl: './claims-list.html',
})
export class ClaimsList {
  private readonly api = inject(ClaimsApi);
  private readonly router = inject(Router);
  protected readonly list = new Operation();
  protected readonly reference = new Operation();
  protected readonly results = signal<Page<ClaimSummary> | null>(null);
  protected readonly causes = signal<Cause[]>([]);
  protected readonly statuses = statuses;
  protected readonly dateError = signal<string | null>(null);
  protected readonly form = inject(FormBuilder).nonNullable.group({
    status: [[] as Status[]], dateFrom: [''], dateTo: [''], assignedHandlerName: [''], causeOfLossCode: [''], search: [''],
  });
  private filters: ClaimFilters = this.form.getRawValue();
  private page = 1;
  private pageSize = 20;

  constructor() {
    this.refreshCauses();
    this.refresh();
  }

  protected refreshCauses(): void {
    this.reference.run(this.api.causes(), causes => this.causes.set(causes));
  }

  protected apply(): void {
    const filters = this.form.getRawValue();
    if (filters.dateFrom && filters.dateTo && filters.dateFrom > filters.dateTo) {
      this.dateError.set('Loss date to must be on or after loss date from.');
      return;
    }
    this.dateError.set(null);
    this.filters = filters;
    this.page = 1;
    this.refresh();
  }

  protected clear(): void {
    this.form.reset();
    this.apply();
  }

  protected paginate(event: PageEvent): void {
    this.page = event.pageIndex + 1;
    this.pageSize = event.pageSize;
    this.refresh();
  }

  protected refresh(): void {
    this.list.run(this.api.list(this.filters, this.page, this.pageSize), result => this.results.set(result));
  }

  protected causeLabel(code: string): string {
    return this.causes().find(cause => cause.code === code)?.name ?? code;
  }

  protected open(claim: ClaimSummary): void {
    void this.router.navigate(['/claims', claim.id]);
  }
}
