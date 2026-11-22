
import { Injectable, signal } from '@angular/core';
import { Identity } from './contracts';

@Injectable({ providedIn: 'root' })
export class Session {
  private readonly user = signal<(Identity & { username: string }) | null>(null);
  readonly identity = this.user.asReadonly();
  token: string | null = null;

  start(token: string): void {
    this.token = token;
  }

  identify(identity: Identity, username: string): void {
    this.user.set({ ...identity, username });
  }

  end(): void {
    this.token = null;
    this.user.set(null);
  }

  actorName(id: string | null | undefined, absent = '—'): string {
    if (!id) return absent;
    const identity = this.identity();
    return id === identity?.userId ? identity.username : id;
  }
}
