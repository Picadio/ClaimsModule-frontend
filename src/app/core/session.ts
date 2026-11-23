
import { Injectable, signal } from '@angular/core';
import { Identity, UserReference } from './contracts';

@Injectable({ providedIn: 'root' })
export class Session {
  private readonly user = signal<(Identity & { username: string }) | null>(null);
  readonly identity = this.user.asReadonly();
  private readonly users = signal<UserReference[] | null>(null);
  readonly directory = this.users.asReadonly();
  token: string | null = null;

  start(token: string): void {
    this.token = token;
  }

  identify(identity: Identity, username: string): void {
    this.users.set(null);
    this.user.set({ ...identity, username });
  }

  setDirectory(identity: Identity | null, users: UserReference[]): void {
    if (identity && identity === this.identity()) this.users.set(users);
  }

  end(): void {
    this.token = null;
    this.user.set(null);
    this.users.set(null);
  }

  actorName(id: string | null | undefined, absent = '—'): string {
    if (!id) return absent;
    const identity = this.identity();
    return this.directory()?.find(user => user.userId === id)?.displayName ??
      (id === identity?.userId ? identity.username : id);
  }
}
