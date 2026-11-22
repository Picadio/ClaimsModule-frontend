
import { DestroyRef, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { finalize, Observable } from 'rxjs';
import { errorMessages } from '../core/api-error';

export class Operation {
  private readonly destroyRef = inject(DestroyRef);
  readonly pending = signal(false);
  readonly errors = signal<string[]>([]);

  run<T>(request: Observable<T>, onSuccess: (value: T) => void, onError?: (error: unknown) => void): void {
    if (this.pending()) return;
    this.errors.set([]);
    this.pending.set(true);
    request.pipe(takeUntilDestroyed(this.destroyRef), finalize(() => this.pending.set(false))).subscribe({
      next: onSuccess,
      error: error => {
        this.errors.set(errorMessages(error));
        onError?.(error);
      },
    });
  }
}

