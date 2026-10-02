import { async, ComponentFixture, TestBed } from '@angular/core/testing';
import { NO_ERRORS_SCHEMA } from '@angular/core';
import { FormGroup, FormControl } from '@angular/forms';
import { ActivatedRoute, Router, convertToParamMap } from '@angular/router';
import { of, Subject } from 'rxjs';
import { SignupComponent } from './signup.component';
import { AuthService } from 'src/app/services/auth/auth-service.service';
import { BetaService } from 'src/app/services/beta.service';
import { AngularFireAnalytics } from '@angular/fire/analytics';
import { TierCatalogService } from 'src/app/services/subscriptions/tier-catalog.service';
import { TierCatalog } from 'src/app/entities/TierCatalog';

const catalog: TierCatalog = {
  currency: 'usd',
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

  function configure(catalogResult = of(catalog)) {
    queryParamMap$ = new Subject();
    navigateSpy = jasmine.createSpy('navigate');
    TestBed.configureTestingModule({
      declarations: [SignupComponent],
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
});
