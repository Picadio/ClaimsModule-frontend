
import { DatePipe } from '@angular/common';
import { Component, computed, DestroyRef, inject, input, OnInit, output, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormBuilder, ReactiveFormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatDialog } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { EMPTY, switchMap, timer } from 'rxjs';
import { ClaimsApi } from '../../core/claims-api';
import {
  ClaimDetail, components, ComponentLedger, Identity, Ledger, ReserveChange, ReserveComponent,
  ReserveTransaction, TransactionType,
} from '../../core/contracts';
import { claimLimit, MoneyPipe, moneyText, moneyUnits, reserveAuthority } from '../../core/money';
import { Session } from '../../core/session';
import { Confirm } from '../../shared/confirm';
import { Feedback } from '../../shared/feedback';
import { Operation } from '../../shared/operation';

type ReserveAction = 'approve' | 'reject' | 'retract' | 'retry-posting';
interface Editing {
  type: TransactionType;
  component?: ComponentLedger;
  replaces?: ReserveTransaction;
}

export function reviewRights(identity: Identity | null, transaction: ReserveTransaction) {
  const elevated = identity?.role === 'manager' ||
    (identity?.role === 'supervisor' && transaction.requiredAuthority !== 'Manager');
  const pending = transaction.approvalStatus === 'PendingApproval';
  const own = !!identity && transaction.submittedByUserId === identity.userId;
  return { approve: pending && elevated && !own, reject: pending && elevated, retract: pending && own };
}

@Component({
  selector: 'app-reserves-tab',
  imports: [
    DatePipe, MoneyPipe, ReactiveFormsModule, MatButtonModule, MatFormFieldModule,
    MatInputModule, MatSelectModule, Feedback,
  ],
  templateUrl: './reserves-tab.html',
})
export class ReservesTab implements OnInit {
  readonly claim = input.required<ClaimDetail>();
  readonly relatedId = input<string | null>(null);
  readonly changed = output<void>();
  private readonly api = inject(ClaimsApi);
  private readonly dialog = inject(MatDialog);
  private readonly fb = inject(FormBuilder).nonNullable;
  private readonly destroyRef = inject(DestroyRef);
  protected readonly session = inject(Session);
  protected readonly loading = new Operation();
  protected readonly saving = new Operation();
  protected readonly ledger = signal<Ledger | null>(null);
  protected readonly editing = signal<Editing | null>(null);
  protected readonly rejecting = signal<ReserveTransaction | null>(null);
  protected readonly overriding = signal(false);
  protected readonly reservedWarnings = signal<string[]>([]);
  protected readonly form = this.fb.group({ component: ['Indemnity' as ReserveComponent], amount: [''], reason: [''] });
  protected readonly reason = this.fb.control('');
  protected readonly canSubmit = computed(() =>
    !!this.claim().policyId && this.claim().status !== 'Closed' && this.claim().status !== 'Withdrawn');
  protected readonly canOverride = computed(() =>
    this.canSubmit() && this.session.identity()?.role === 'manager' && !this.ledger()?.reserveLimitOverrideEnabled);
  protected readonly entries = computed(() =>
    (this.ledger()?.components ?? []).flatMap(component => component.history)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt) || b.changeSequence - a.changeSequence));
  protected readonly available = computed(() => components.filter(type => {
    const component = this.ledger()?.components.find(item => item.component === type);
    return !component || (moneyUnits(component.currentAmount) === 0n &&
      !component.history.some(entry => entry.transactionType === 'Add' && entry.approvalStatus === 'PendingApproval'));
  }));

  ngOnInit(): void {
    this.refresh();
    timer(5000, 5000).pipe(takeUntilDestroyed(this.destroyRef)).subscribe(() => {
      if (!this.loading.errors().length && !this.saving.pending() && !this.editing() && !this.rejecting() &&
          !this.overriding() && this.entries().some(entry => entry.postingStatus === 'Pending' &&
            (entry.approvalStatus === 'Approved' || entry.approvalStatus === 'AutoApproved'))) {
        this.refresh();
      }
    });
  }

  protected refresh(): void {
    this.loading.run(this.api.ledger(this.claim().id), result => this.ledger.set(result));
  }

  protected begin(type: TransactionType, component?: ComponentLedger, replaces?: ReserveTransaction): void {
    const current = component && moneyUnits(component.currentAmount);
    const amount = type === 'Reverse' && current ? moneyText(-current) : replaces?.amount ?? '';
    this.editing.set({ type, component, replaces });
    this.rejecting.set(null);
    this.overriding.set(false);
    this.saving.errors.set([]);
    this.reservedWarnings.set([]);
    this.form.reset({ component: component?.component ?? this.available()[0] ?? 'Indemnity', amount });
  }

  protected adjust(component: ComponentLedger, type: 'Adjust' | 'Reverse'): void {
    this.begin(type, component);
  }

  protected revision(entry: ReserveTransaction): void {
    const component = this.ledger()?.components.find(candidate => candidate.id === entry.reserveId);
    if (component) this.begin(entry.transactionType, component, entry);
  }

  protected revisable(entry: ReserveTransaction): boolean {
    const existingRevision = this.entries().some(candidate => candidate.replacesRejectedTransactionId === entry.id &&
      candidate.approvalStatus !== 'Cancelled');
    if (existingRevision || !this.canSubmit() || entry.approvalStatus !== 'Rejected' ||
        entry.submittedByUserId !== this.session.identity()?.userId) return false;
    if (entry.transactionType === 'Add') return this.available().includes(entry.component);
    const component = this.ledger()?.components.find(item => item.id === entry.reserveId);
    return !!component && moneyUnits(component.currentAmount) !== 0n;
  }

  private projectedOverride(amount: bigint): boolean {
    const data = this.ledger();
    const total = moneyUnits(data?.totalReserves ?? '0');
    return !!data && !data.reserveLimitOverrideEnabled && total !== null && total + amount > claimLimit;
  }

  protected amountError(): string | null {
    const editing = this.editing();
    if (!editing || !this.form.controls.amount.value.trim()) return null;
    const amount = moneyUnits(this.form.controls.amount.value);
    if (amount === null || amount === 0n) return 'Enter a nonzero amount with up to four decimal places and 15 integer digits.';
    const current = moneyUnits(editing.component?.currentAmount ?? '0') ?? 0n;
    const component = editing.component?.component ?? this.form.controls.component.value;
    if (component === 'SubrogationRecoverable' ? current + amount > 0n : current + amount < 0n) {
      return component === 'SubrogationRecoverable' ? 'A recoverable balance must be zero or negative.'
        : 'The approved balance cannot become negative.';
    }
    if (moneyUnits(moneyText(current + amount)) === null) return 'The projected balance exceeds the supported precision.';
    return null;
  }

  protected amountHint(): string | null {
    const units = moneyUnits(this.form.controls.amount.value);
    if (units === null || this.amountError()) return null;
    const authority = reserveAuthority(units);
    if (this.projectedOverride(units)) return 'Manager override required for the projected total.';
    if (authority === 'Automatic') return this.editing()?.replaces ? 'Supervisor approval required for revised submissions.' : 'Auto-approved';
    return authority + ' approval required';
  }

  protected save(): void {
    const editing = this.editing();
    const value = this.form.getRawValue();
    const amount = moneyUnits(value.amount);
    if (!editing || !amount || !value.reason.trim() || this.amountError() || !this.canSubmit() || this.busy()) return;
    const change: ReserveChange = {
      amount: moneyText(amount), changeReason: value.reason.trim(), transactionType: editing.type,
      replacesRejectedTransactionId: editing.replaces?.id,
    };
    const id = this.claim().id;
    const request = editing.type === 'Add' || !editing.component
      ? this.api.addReserve(id, value.component, change)
      : this.api.changeReserve(id, editing.component.id, change);
    this.saving.run(request, entry => {
      this.reservedWarnings.set(entry.warnings.map(warning => warning.message));
      this.editing.set(null);
      this.update();
    });
  }

  protected hasPending(component: ComponentLedger): boolean {
    return component.history.some(transaction => transaction.approvalStatus === 'PendingApproval');
  }
  protected canChangeBalance(component: ComponentLedger): boolean {
    return this.canSubmit() && moneyUnits(component.currentAmount) !== 0n;
  }

  protected rights(entry: ReserveTransaction) {
    return reviewRights(this.session.identity(), entry);
  }

  protected approvalBlocked(entry: ReserveTransaction): boolean {
    const amount = moneyUnits(entry.amount);
    return !this.canSubmit() || (amount !== null && this.projectedOverride(amount));
  }

  protected startReject(entry: ReserveTransaction): void {
    this.editing.set(null);
    this.overriding.set(false);
    this.reason.reset();
    this.rejecting.set(entry);
    this.saving.errors.set([]);
  }

  protected startOverride(): void {
    this.editing.set(null);
    this.rejecting.set(null);
    this.reason.reset();
    this.overriding.set(true);
    this.saving.errors.set([]);
  }

  protected override(): void {
    if (this.busy() || !this.canOverride() || !this.reason.value.trim()) return;
    this.saving.run(this.api.enableOverride(this.claim().id, this.reason.value.trim()), () => {
      this.overriding.set(false);
      this.update();
    });
  }

  protected action(entry: ReserveTransaction, action: ReserveAction): void {
    if (this.busy() || (action === 'approve' && this.approvalBlocked(entry))) return;
    const rejectionReason = action === 'reject' ? this.reason.value.trim() : undefined;
    if (action === 'reject' && !rejectionReason) return;
    const labels: Record<ReserveAction, string> = {
      approve: 'Approve', reject: 'Reject', retract: 'Retract', 'retry-posting': 'Retry GL posting',
    };
    const label = labels[action];
    const id = this.claim().id;
    this.saving.run(this.dialog.open(Confirm, { data: {
      title: label + '?', messages: [entry.component + ' · ' + entry.transactionType + ' · ' + entry.amount + ' USD'],
      action: label,
    } }).afterClosed().pipe(switchMap(confirmed =>
      confirmed ? this.api.reserveAction(id, entry.id, action, rejectionReason) : EMPTY)), () => {
      this.rejecting.set(null);
      this.update();
    });
  }

  protected busy(): boolean {
    return this.loading.pending() || this.saving.pending();
  }

  private update(): void {
    this.refresh();
    this.changed.emit();
  }
}


