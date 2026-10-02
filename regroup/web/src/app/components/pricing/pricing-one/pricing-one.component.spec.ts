import { async, ComponentFixture, TestBed } from '@angular/core/testing';
import { NO_ERRORS_SCHEMA } from '@angular/core';
import { of } from 'rxjs';

import { PricingOneComponent } from './pricing-one.component';
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

describe('PricingOneComponent', () => {
  let component: PricingOneComponent;
  let fixture: ComponentFixture<PricingOneComponent>;

  beforeEach(async(() => {
    TestBed.configureTestingModule({
      declarations: [PricingOneComponent],
      schemas: [NO_ERRORS_SCHEMA],
      providers: [
        {
          provide: TierCatalogService,
          useValue: { getCatalog: () => of(catalog) },
        },
      ],
    }).compileComponents();
  }));

  beforeEach(() => {
    fixture = TestBed.createComponent(PricingOneComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('splits tiers into traditional and oxford ladders', () => {
    expect(component.traditionalTiers.length).toBe(1);
    expect(component.oxfordTiers.length).toBe(1);
  });

  it('routes a for-sale tier CTA to /signup, and a not-for-sale tier to /contact', () => {
    expect(component.ctaRoute(catalog.tiers[0])).toEqual(['/signup']);
    expect(component.ctaRoute(catalog.tiers[1])).toEqual(['/contact']);
    expect(component.ctaLabel(catalog.tiers[1])).toBe('Contact Sales');
  });

  it('computes real annual savings from the two prices', () => {
    // 6900/mo vs 69000/yr -> 5750/mo equivalent -> ~16.7% savings
    expect(component.annualSavingsPct(catalog.tiers[0])).toBe(17);
  });

  it('falls back to the monthly interval when a tier has no annual price', () => {
    component.setBillingInterval('year');
    expect(component.effectiveInterval(catalog.tiers[1])).toBe('month');
    expect(component.hasAnnual(catalog.tiers[1])).toBe(false);
  });
});
