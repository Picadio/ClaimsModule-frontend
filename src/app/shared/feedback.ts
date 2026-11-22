
import { Component, input } from '@angular/core';
import { MatProgressBarModule } from '@angular/material/progress-bar';

@Component({
  selector: 'app-feedback',
  imports: [MatProgressBarModule],
  template: `
    @if (loading()) {
      <mat-progress-bar mode="indeterminate" aria-label="Loading"></mat-progress-bar>
    }
    @if (errors().length) {
      <ul class="feedback error" role="alert">
        @for (error of errors(); track $index) { <li>{{ error }}</li> }
      </ul>
    }
  `,
})
export class Feedback {
  readonly loading = input(false);
  readonly errors = input<string[]>([]);
}
