
import { Component, input } from '@angular/core';
import { Status } from '../core/contracts';

@Component({
  selector: 'app-status-chip',
  template: `<span class="status" [attr.data-status]="status()">{{ labels[status()] }}</span>`,
})
export class StatusChip {
  readonly status = input.required<Status>();
  protected readonly labels: Record<Status, string> = {
    Draft: 'Draft', Open: 'Open', UnderInvestigation: 'Under investigation', PendingPayment: 'Pending payment',
    Closed: 'Closed', Reopened: 'Reopened', Withdrawn: 'Withdrawn',
  };
}
