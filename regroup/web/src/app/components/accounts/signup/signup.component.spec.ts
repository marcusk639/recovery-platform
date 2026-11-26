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
            userWithEmailExists: () => Promise.resolve(false),
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

  beforeEach(async(() => configure()));

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

    function reconfigure(result: Observable<TierCatalog>) {
      TestBed.resetTestingModule();
      configure(result);
    }

    it("shows the catalog's trial length: trialDays 5 renders a 5-day free trial", () => {
      reconfigure(of({ ...catalog, trialDays: 5 }));
      queryParamMap$.next(starterParams());
      fixture.detectChanges();
      expect(component.trialDays).toBe(5);
      expect(text()).toContain('5-day free trial.');
      expect(text()).not.toContain('7-day');
    });

    it('with sales closed, shows "Coming soon", no form and no card step', async () => {
      reconfigure(of({ ...catalog, salesOpen: false }));
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

    it('with sales closed and no tier in the URL, shows "Coming soon" instead of the picker', () => {
      reconfigure(of({ ...catalog, salesOpen: false }));
      queryParamMap$.next(convertToParamMap({}));
      fixture.detectChanges();
      expect(component.pickerVisible).toBe(false);
      expect(text()).toContain('Coming soon');
      expect(el().querySelector('tier-picker')).toBeNull();
    });

    it('with sales open, the account step shows the plan and its price', () => {
      reconfigure(of(catalog));
      queryParamMap$.next(starterParams());
      fixture.detectChanges();
      expect(component.salesClosed).toBe(false);
      expect(text()).toContain('$69 / mo');
      expect(text()).toContain('7-day free trial.');
      expect(el().querySelector('#contact-form')).not.toBeNull();
    });

    it('with the catalog unavailable, shows the error and no price, trial or form', () => {
      reconfigure(throwError(new Error('unavailable')));
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
});
