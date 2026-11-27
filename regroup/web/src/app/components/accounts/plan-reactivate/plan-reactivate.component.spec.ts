import { ComponentFixture, TestBed, fakeAsync, tick } from '@angular/core/testing';
import { RouterTestingModule } from '@angular/router/testing';
import { of, throwError } from 'rxjs';
import { PlanReactivateComponent } from './plan-reactivate.component';
import { CloudFunctionService } from 'src/app/services/functions/cloud-function.service';
import { TierCatalogService } from 'src/app/services/subscriptions/tier-catalog.service';

// Launch item M9 (owner decision 2026-11-26): an operator whose plan was
// canceled or is cancelling can restart it from my-account; an account with no
// plan is sent to choose one.
describe('PlanReactivateComponent', () => {
  let fixture: ComponentFixture<PlanReactivateComponent>;
  let component: PlanReactivateComponent;
  let reactivate: jasmine.Spy;
  let catalog: any;

  const user = (subscriptionMetadata: any) =>
    ({ id: 'u1', email: 'op@rats-e2e.com', subscriptionMetadata }) as any;
  const canceled = { status: 'canceled', houseType: 'traditional', tier: 'starter' };

  const setup = (u: any, opts: { catalogDown?: boolean } = {}) => {
    reactivate = jasmine.createSpy('reactivateOperatorSubscription');
    catalog = opts.catalogDown ? null : {
      currency: 'usd',
      tiers: [
        {
          houseType: 'traditional',
          tier: 'starter',
          name: 'Starter',
          prices: { month: { amountCents: 6900 }, year: null },
        },
      ],
    };
    TestBed.configureTestingModule({
      imports: [RouterTestingModule],
      declarations: [PlanReactivateComponent],
      providers: [
        { provide: CloudFunctionService, useValue: { reactivateOperatorSubscription: reactivate } },
        {
          provide: TierCatalogService,
          useValue: { getCatalog: () => (catalog ? of(catalog) : throwError('down')) },
        },
      ],
    });
    fixture = TestBed.createComponent(PlanReactivateComponent);
    component = fixture.componentInstance;
    component.user = u;
    fixture.detectChanges();
    return fixture.nativeElement as HTMLElement;
  };

  const byTestId = (el: HTMLElement, id: string) =>
    el.querySelector<HTMLElement>(`[data-testid="${id}"]`);

  it('offers nothing for an active plan', () => {
    const el = setup(user({ status: 'active', tier: 'starter' }));
    expect(byTestId(el, 'reactivate-plan')).toBeNull();
    expect(byTestId(el, 'choose-plan')).toBeNull();
  });

  it('offers Reactivate for a canceled plan, and confirms the price before charging', () => {
    const el = setup(user(canceled));
    byTestId(el, 'reactivate-plan')!.click();
    fixture.detectChanges();
    expect(reactivate).not.toHaveBeenCalled();
    expect(byTestId(el, 'reactivate-confirm-text')!.textContent).toContain('$69.00');
    expect(byTestId(el, 'reactivate-confirm-text')!.textContent).toContain('today');
  });

  it('reactivates on confirm, once, and reports the new plan', fakeAsync(() => {
    const el = setup(user(canceled));
    let emitted: any = null;
    component.reactivated.subscribe((u: any) => (emitted = u));
    reactivate.and.returnValue(
      Promise.resolve({ id: 'u1', subscriptionMetadata: { ...canceled, status: 'active' } }),
    );
    byTestId(el, 'reactivate-plan')!.click();
    fixture.detectChanges();
    const confirm = byTestId(el, 'reactivate-confirm')!;
    confirm.click();
    confirm.click();
    tick();
    fixture.detectChanges();
    expect(reactivate).toHaveBeenCalledTimes(1);
    expect(reactivate.calls.mostRecent().args[0].id).toBe('u1');
    expect(emitted.subscriptionMetadata.status).toBe('active');
    expect(byTestId(el, 'reactivate-notice')!.textContent).toContain('active again');
  }));

  it('resumes a cancelling plan without a charge-today warning', () => {
    const el = setup(user({ ...canceled, status: 'cancelling' }));
    expect(byTestId(el, 'reactivate-plan')!.textContent).toContain('Resume');
    byTestId(el, 'reactivate-plan')!.click();
    fixture.detectChanges();
    expect(byTestId(el, 'reactivate-confirm-text')!.textContent).not.toContain('today');
  });

  it('says payment needs attention when Stripe leaves the new plan incomplete', fakeAsync(() => {
    const el = setup(user(canceled));
    reactivate.and.returnValue(
      Promise.resolve({ id: 'u1', subscriptionMetadata: { ...canceled, status: 'incomplete' } }),
    );
    byTestId(el, 'reactivate-plan')!.click();
    fixture.detectChanges();
    byTestId(el, 'reactivate-confirm')!.click();
    tick();
    fixture.detectChanges();
    expect(byTestId(el, 'reactivate-notice')!.textContent).toContain('Manage Billing');
  }));

  it('shows the server message and a way to choose a plan when it refuses', fakeAsync(() => {
    const el = setup(user(canceled));
    reactivate.and.returnValue(
      Promise.reject({
        code: 'functions/failed-precondition',
        message: 'This plan is no longer offered. Choose a plan to subscribe again.',
      }),
    );
    byTestId(el, 'reactivate-plan')!.click();
    fixture.detectChanges();
    byTestId(el, 'reactivate-confirm')!.click();
    tick();
    fixture.detectChanges();
    expect(byTestId(el, 'reactivate-error')!.textContent).toContain('no longer offered');
    expect(byTestId(el, 'choose-plan')!.getAttribute('href')).toContain('/pricing');
  }));

  it('sends an account that never had a plan to choose one, keeping from=app', () => {
    const el = setup(user({ status: '' }));
    component.fromApp = true;
    fixture.detectChanges();
    expect(byTestId(el, 'reactivate-plan')).toBeNull();
    expect(byTestId(el, 'choose-plan')!.getAttribute('href')).toBe('/pricing?from=app');
  });

  it('confirms without a price when the catalog is unavailable', () => {
    const el = setup(user(canceled), { catalogDown: true });
    byTestId(el, 'reactivate-plan')!.click();
    fixture.detectChanges();
    const text = byTestId(el, 'reactivate-confirm-text')!.textContent!;
    expect(text).not.toMatch(/\$\d/);
    expect(text).toContain('today');
  });
});
