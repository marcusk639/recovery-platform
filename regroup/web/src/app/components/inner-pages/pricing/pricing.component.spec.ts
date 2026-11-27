import { async, ComponentFixture, TestBed } from '@angular/core/testing';
import { NO_ERRORS_SCHEMA } from '@angular/core';
import { RouterTestingModule } from '@angular/router/testing';
import { AngularFireAnalytics } from '@angular/fire/analytics';
import { Observable, of, throwError } from 'rxjs';

import { PricingComponent } from './pricing.component';
import { TierCatalogService } from 'src/app/services/subscriptions/tier-catalog.service';
import { TierCatalog } from 'src/app/entities/TierCatalog';

const catalog = (trialDays: number, salesOpen: boolean): TierCatalog => ({
  currency: 'usd',
  trialDays,
  salesOpen,
  tiers: [],
});

describe('PricingComponent', () => {
  let component: PricingComponent;
  let fixture: ComponentFixture<PricingComponent>;
  let catalog$: Observable<TierCatalog>;

  const create = (source: Observable<TierCatalog>) => {
    catalog$ = source;
    fixture = TestBed.createComponent(PricingComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  };
  const floatingButton = (): HTMLButtonElement | null =>
    fixture.nativeElement.querySelector('.floating button');

  beforeEach(async(() => {
    TestBed.configureTestingModule({
      imports: [RouterTestingModule],
      declarations: [PricingComponent],
      schemas: [NO_ERRORS_SCHEMA],
      providers: [
        {
          provide: AngularFireAnalytics,
          useValue: { logEvent: () => Promise.resolve() },
        },
        {
          provide: TierCatalogService,
          useValue: { getCatalog: () => catalog$ },
        },
      ],
    }).compileComponents();
  }));

  it('should create', () => {
    create(of(catalog(7, true)));
    expect(component).toBeTruthy();
  });

  // The floating button follows the catalog, like the plan cards (pricing-one).
  it('offers a free trial only when the catalog has one', () => {
    create(of(catalog(7, true)));
    expect(floatingButton().textContent.trim()).toBe('Start Free Trial');
  });

  it('says Get Started when there is no trial', () => {
    create(of(catalog(0, true)));
    expect(floatingButton().textContent.trim()).toBe('Get Started');
  });

  it('shows no sign-up button while sales are closed', () => {
    create(of(catalog(7, false)));
    expect(floatingButton()).toBeNull();
  });

  it("shows no sign-up button when the catalog can't be read", () => {
    create(throwError(new Error('unavailable')));
    expect(floatingButton()).toBeNull();
  });
});
