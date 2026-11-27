import { async, ComponentFixture, TestBed } from '@angular/core/testing';
import { NO_ERRORS_SCHEMA } from '@angular/core';
import { FormGroup, FormControl } from '@angular/forms';
import { ActivatedRoute, Router, convertToParamMap } from '@angular/router';
import { Observable, of, Subject, throwError } from 'rxjs';
import { SignupComponent } from './signup.component';
import { AuthService } from 'src/app/services/auth/auth-service.service';
import { BetaService } from 'src/app/services/beta.service';
import { AngularFireAnalytics } from '@angular/fire/analytics';
import { TierCatalogService } from 'src/app/services/subscriptions/tier-catalog.service';
import { TierCatalog } from 'src/app/entities/TierCatalog';
import { OrderSummaryComponent } from '../../pricing/order-summary/order-summary.component';

const catalog: TierCatalog = {
  currency: 'usd',
  trialDays: 7,
  salesOpen: true,
  tiers: [
    {
      houseType: 'traditional',
      tier: 'starter',
      label: 'Traditional Starter',
      maxResidents: 10,
      maxProperties: 1,
      availableForSale: true,
      features: {
        automatedRentCollection: false,
        multiProperty: false,
        complianceExport: false,
        analytics: false,
        whiteLabel: false,
      },
      prices: { month: { amountCents: 6900 }, year: { amountCents: 69000 } },
    },
    {
      houseType: 'oxford',
      tier: 'network',
      label: 'Oxford Network',
      maxResidents: null,
      maxProperties: null,
      availableForSale: false,
      features: {
        automatedRentCollection: true,
        multiProperty: true,
        complianceExport: true,
        analytics: true,
        whiteLabel: true,
      },
      prices: { month: { amountCents: 29900 }, year: null },
    },
  ],
};

describe('SignupComponent', () => {
  let component: SignupComponent;
  let fixture: ComponentFixture<SignupComponent>;
  let queryParamMap$: Subject<any>;
  let navigateSpy: jasmine.Spy;
  let subscribeOperatorSpy: jasmine.Spy;
  let userWithEmailExistsSpy: jasmine.Spy;
  let logoutSpy: jasmine.Spy;
  // The signed-in, non-anonymous account AuthService.signedInAccount finds (M9).
  let signedIn: any = null;

  function configure(catalogResult: Observable<TierCatalog> = of(catalog)) {
    queryParamMap$ = new Subject();
    navigateSpy = jasmine.createSpy('navigate');
    // billing-info's buy() -> subscribeOperator is the only path to the
    // createOperatorSubscription callable.
    subscribeOperatorSpy = jasmine.createSpy('subscribeOperator');
    TestBed.configureTestingModule({
      declarations: [SignupComponent, OrderSummaryComponent],
      schemas: [NO_ERRORS_SCHEMA],
      providers: [
        {
          provide: AuthService,
          useValue: {
            buildAuthForm: () =>
              new FormGroup({
                fullName: new FormControl(''),
                email: new FormControl(''),
                password: new FormControl(''),
              }),
            subscribeOperator: subscribeOperatorSpy,
            userWithEmailExists: (userWithEmailExistsSpy = jasmine
              .createSpy('userWithEmailExists')
              .and.resolveTo(false)),
            signedInAccount: () => Promise.resolve(signedIn),
            logout: (logoutSpy = jasmine.createSpy('logout').and.resolveTo(undefined)),
            cachedDetails: {},
          },
        },
        { provide: BetaService, useValue: {} },
        {
          provide: AngularFireAnalytics,
          useValue: { logEvent: () => Promise.resolve() },
        },
        {
          provide: ActivatedRoute,
          useValue: { queryParamMap: queryParamMap$.asObservable() },
        },
        { provide: Router, useValue: { navigate: navigateSpy } },
        { provide: TierCatalogService, useValue: { getCatalog: () => catalogResult } },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(SignupComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  }

  beforeEach(async(() => {
    signedIn = null;
    configure();
  }));

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('shows the capacity picker when the query string has no tier params', () => {
    queryParamMap$.next(convertToParamMap({}));
    expect(component.resolvingTier).toBe(false);
    expect(component.pickerVisible).toBe(true);
    expect(component.selectedTier).toBeNull();
  });

  it('resolves a valid for-sale tier from query params against the catalog', () => {
    queryParamMap$.next(
      convertToParamMap({ houseType: 'traditional', tier: 'starter', period: 'year' }),
    );
    expect(component.resolvingTier).toBe(false);
    expect(component.pickerVisible).toBe(false);
    expect(component.selectedTier.tier).toBe('starter');
    expect(component.billingInterval).toBe('year');
  });

  it('falls back to the picker for an unknown tier instead of a silent default', () => {
    queryParamMap$.next(convertToParamMap({ houseType: 'traditional', tier: 'nonexistent' }));
    expect(component.pickerVisible).toBe(true);
    expect(component.selectedTier).toBeNull();
  });

  it('falls back to the picker for a not-for-sale tier instead of checkout', () => {
    queryParamMap$.next(convertToParamMap({ houseType: 'oxford', tier: 'network' }));
    expect(component.pickerVisible).toBe(true);
    expect(component.selectedTier).toBeNull();
  });

  it('re-navigates with merged query params when the picker emits a selection', () => {
    component.onTierSelected({ houseType: 'traditional', tier: 'starter', period: 'month' });
    expect(navigateSpy).toHaveBeenCalledWith(
      [],
      jasmine.objectContaining({
        queryParams: { houseType: 'traditional', tier: 'starter', period: 'month' },
        queryParamsHandling: 'merge',
      }),
    );
  });

  // Launch P5 Task 11: a checkout started from the app hands back to it.
  describe('hand-back to the app', () => {
    const setFrom = (from: string | null) =>
      ((TestBed.inject(ActivatedRoute) as any).snapshot = {
        queryParamMap: convertToParamMap(from ? { from } : {}),
      });

    it('with from=app, a completed checkout goes to /checkout-return?result=success', () => {
      setFrom('app');
      component.setBillingCompleted(true);
      expect(navigateSpy).toHaveBeenCalledWith(['/checkout-return'], {
        queryParams: { result: 'success' },
      });
    });

    it('without from=app, it stays on the success block with the download prompt', () => {
      setFrom(null);
      component.setBillingCompleted(true);
      expect(navigateSpy).not.toHaveBeenCalledWith(['/checkout-return'], jasmine.anything());
      expect(component.billingCompleted).toBe(true);
      expect(component.fromApp).toBe(false);
    });

    it('does not hand back before billing completes', () => {
      setFrom('app');
      component.setBillingCompleted(false);
      expect(navigateSpy).not.toHaveBeenCalledWith(['/checkout-return'], jasmine.anything());
    });
  });
  // Launch P5 Task 12: trial length and the sales switch come from the catalog.
  describe('catalog-driven checkout', () => {
    const text = (): string =>
      ((fixture.nativeElement as HTMLElement).textContent || '').replace(/\s+/g, ' ');
    const el = (): HTMLElement => fixture.nativeElement as HTMLElement;
    const starterParams = () =>
      convertToParamMap({ houseType: 'traditional', tier: 'starter', period: 'month' });

    // Resolves once the signed-in account check (AuthService.signedInAccount) has
    // settled: the account step waits for it.
    function reconfigure(result: Observable<TierCatalog>): Promise<unknown> {
      TestBed.resetTestingModule();
      configure(result);
      return fixture.whenStable();
    }

    it("shows the catalog's trial length: trialDays 5 renders a 5-day free trial", async () => {
      await reconfigure(of({ ...catalog, trialDays: 5 }));
      queryParamMap$.next(starterParams());
      fixture.detectChanges();
      expect(component.trialDays).toBe(5);
      expect(text()).toContain('5-day free trial.');
      expect(text()).not.toContain('7-day');
    });

    it('with sales closed, shows "Coming soon", no form and no card step', async () => {
      await reconfigure(of({ ...catalog, salesOpen: false }));
      queryParamMap$.next(starterParams());
      fixture.detectChanges();
      expect(component.salesClosed).toBe(true);
      expect(component.selectedTier).toBeNull();
      expect(text()).toContain('Coming soon');
      expect(el().querySelector('#contact-form')).toBeNull();
      expect(el().querySelector('tier-picker')).toBeNull();
      expect(el().querySelector('billing-info')).toBeNull();

      await component.onSubmit();
      fixture.detectChanges();
      expect(component.signUpStarted).toBe(false);
      expect(el().querySelector('billing-info')).toBeNull();
      expect(subscribeOperatorSpy).not.toHaveBeenCalled();
    });

    it('with sales closed and no tier in the URL, shows "Coming soon" instead of the picker', async () => {
      await reconfigure(of({ ...catalog, salesOpen: false }));
      queryParamMap$.next(convertToParamMap({}));
      fixture.detectChanges();
      expect(component.pickerVisible).toBe(false);
      expect(text()).toContain('Coming soon');
      expect(el().querySelector('tier-picker')).toBeNull();
    });

    it('with sales open, the account step shows the plan and its price', async () => {
      await reconfigure(of(catalog));
      queryParamMap$.next(starterParams());
      fixture.detectChanges();
      expect(component.salesClosed).toBe(false);
      expect(text()).toContain('$69 / mo');
      expect(text()).toContain('7-day free trial.');
      expect(el().querySelector('#contact-form')).not.toBeNull();
    });

    it('with the catalog unavailable, shows the error and no price, trial or form', async () => {
      await reconfigure(throwError(new Error('unavailable')));
      queryParamMap$.next(starterParams());
      fixture.detectChanges();
      expect(component.catalogError).toBe(true);
      expect(text()).toContain("We couldn't load current pricing");
      expect(text()).not.toMatch(/\$\s*\d/);
      expect(text()).not.toMatch(/\d+-day/i);
      expect(el().querySelector('#contact-form')).toBeNull();
      expect(el().querySelector('billing-info')).toBeNull();
    });
  });

  // Launch item M9: an existing account that never had a plan checks out here
  // while signed in. The server refuses one with a plan (util/checkoutGuard).
  describe('signed in to an existing account', () => {
    const el = (): HTMLElement => fixture.nativeElement as HTMLElement;
    const starter = () => convertToParamMap({ houseType: 'traditional', tier: 'starter' });
    const account = (meta: object = {}, extra: object = {}) => ({
      id: 'uid-9',
      uid: 'uid-9',
      email: 'op@example.com',
      isGuest: false,
      isAdmin: false,
      isSuperAdmin: false,
      ...extra,
      subscriptionMetadata: { status: '', subscriptionId: '', houses: {}, ...meta },
    });
    async function signInAs(value: any, params = starter()) {
      TestBed.resetTestingModule();
      signedIn = value;
      configure();
      await fixture.whenStable();
      queryParamMap$.next(params);
      fixture.detectChanges();
    }

    it('skips the account step and the email-in-use check, and checks out this account', async () => {
      await signInAs(account());
      expect(component.signUpStarted).toBe(true);
      expect(component.user).toEqual(jasmine.objectContaining({ id: 'uid-9' }));
      expect(el().querySelector('#contact-form')).toBeNull();
      expect(userWithEmailExistsSpy).not.toHaveBeenCalled();
      const billing = fixture.debugElement.query((d) => d.name === 'billing-info');
      expect(billing.properties.existingAccount).toBe(true);
      expect(el().querySelector('[data-testid="signed-in-as"]').textContent).toContain('op@example.com');
    });

    it('with no plan in the URL, shows the picker first, then the card step', async () => {
      await signInAs(account(), convertToParamMap({}));
      expect(component.pickerVisible).toBe(true);
      expect(component.signUpStarted).toBe(false);
      queryParamMap$.next(starter());
      expect(component.signUpStarted).toBe(true);
    });

    it('with a plan, points to my-account and never shows the card step', async () => {
      await signInAs(account({ status: 'trialing', subscriptionId: 'sub_1', tier: 'starter' }));
      expect(component.accountNotice).toBe('plan-exists');
      expect(component.signUpStarted).toBe(false);
      expect(el().querySelector('billing-info')).toBeNull();
      expect(el().querySelector('[data-testid="go-to-account"]')).not.toBeNull();
    });

    it('with an ended tier plan, points to Reactivate', async () => {
      await signInAs(account({ status: 'canceled', subscriptionId: 'sub_1', tier: 'starter' }));
      expect(component.accountNotice).toBe('plan-ended');
      expect(el().querySelector('[data-testid="account-notice"]').textContent).toContain('Reactivate');
    });

    it('with an ended legacy plan (no tier), goes to the card step as the server allows', async () => {
      await signInAs(account({ status: 'canceled', subscriptionId: 'sub_old' }));
      expect(component.accountNotice).toBeNull();
      expect(component.signUpStarted).toBe(true);
    });

    it('as a resident, explains why and offers sign-out, with no card step', async () => {
      await signInAs(account({}, { isGuest: true }));
      expect(component.accountNotice).toBe('not-operator-account');
      expect(el().querySelector('billing-info')).toBeNull();
      expect(el().querySelector('[data-testid="go-to-account"]')).toBeNull();
      expect(el().querySelector('[data-testid="sign-out"]')).not.toBeNull();
    });

    it('signing out returns to the account step', async () => {
      await signInAs(account({}, { isAdmin: true }));
      await component.signOut();
      fixture.detectChanges();
      expect(logoutSpy).toHaveBeenCalled();
      expect(component.account).toBeNull();
      expect(el().querySelector('#contact-form')).not.toBeNull();
    });

    it('with from=app, a completed checkout hands back to the app', async () => {
      await signInAs(account());
      (TestBed.inject(ActivatedRoute) as any).snapshot = {
        queryParamMap: convertToParamMap({ from: 'app' }),
      };
      component.setBillingCompleted(true);
      expect(navigateSpy).toHaveBeenCalledWith(['/checkout-return'], {
        queryParams: { result: 'success' },
      });
    });
  });
});

