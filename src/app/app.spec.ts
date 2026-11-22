
import { TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { App } from './app';
import { Session } from './core/session';

describe('App shell', () => {
  it('shows the active username and role and signs the user out', () => {
    TestBed.configureTestingModule({ imports: [App], providers: [provideRouter([])] });
    const router = TestBed.inject(Router);
    vi.spyOn(router, 'navigate').mockResolvedValue(true);
    const session = TestBed.inject(Session);
    session.start('demo');
    session.identify({ userId: 'user', organizationEntityId: 'org', role: 'supervisor' }, 'demo-supervisor');
    const fixture = TestBed.createComponent(App);
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('demo-supervisor');
    expect(fixture.nativeElement.textContent).toContain('supervisor');
    fixture.nativeElement.querySelector('button').click();
    expect(session.identity()).toBeNull();
    expect(session.token).toBeNull();
    expect(router.navigate).toHaveBeenCalledWith(['/login'], { queryParams: { returnTo: '/' } });
  });
});
