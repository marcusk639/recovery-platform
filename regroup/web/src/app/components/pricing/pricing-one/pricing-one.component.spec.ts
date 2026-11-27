import { async, ComponentFixture, TestBed } from '@angular/core/testing';
import { NO_ERRORS_SCHEMA } from '@angular/core';
import { Observable, of, throwError } from 'rxjs';
import { ActivatedRoute, convertToParamMap } from '@angular/router';

import { PricingOneComponent } from './pricing-one.component';
import { TierCatalogService } from 'src/app/services/subscriptions/tier-catalog.service';
import { TierCatalog } from 'src/app/entities/TierCatalog';

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

describe('PricingOneComponent', () => {
  let component: PricingOneComponent;
  let fixture: ComponentFixture<PricingOneComponent>;
  const route: any = { snapshot: { queryParamMap: convertToParamMap({}) } };
  let catalog$: Observable<TierCatalog> = of(catalog);

  beforeEach(async(() => {
    TestBed.configureTestingModule({
      declarations: [PricingOneComponent],
      schemas: [NO_ERRORS_SCHEMA],
      providers: [
        {
          provide: TierCatalogService,
          useValue: { getCatalog: () => catalog$ },
        },
        { provide: ActivatedRoute, useValue: route },
      ],
    }).compileComponents();
  }));

  beforeEach(() => {
    catalog$ = of(catalog);
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

  // Launch item M6: the page sells only what the released apps do.
  describe('feature list', () => {
    const lists = (): string[] =>
      Array.from((fixture.nativeElement as HTMLElement).querySelectorAll('ul.plan-features')).map(
        (ul) => (ul.textContent || '').replace(/\s+/g, ' '),
      );

    it('renders one list per tier', () => {
      expect(lists().length).toBe(2);
    });

    it('never offers autopay or white-label, even when the catalog flags them', () => {
      for (const text of lists()) {
        expect(text).not.toContain('Automated rent collection');
        expect(text).not.toContain('White-label');
      }
    });

    it('lists online rent payments on every tier', () => {
      for (const text of lists()) {
        expect(text).toContain('Online rent payments by card');
      }
    });

    it('marks compliance export and analytics as coming soon, only where the tier has them', () => {
      const [starter, network] = lists();
      expect(network).toContain('Compliance export (coming soon)');
      expect(network).toContain('Analytics & ROI reporting (coming soon)');
      expect(starter).not.toContain('Compliance export');
      expect(starter).not.toContain('Analytics');
    });
  });

  // Launch P5 Task 11: opened from the app, the chosen plan's signup keeps from=app.
  it('carries from=app into the signup link only when the page has it', () => {
    route.snapshot = { queryParamMap: convertToParamMap({ from: 'app' }) };
    expect(component.signupQueryParams(catalog.tiers[0])).toEqual(
      jasmine.objectContaining({ from: 'app', houseType: catalog.tiers[0].houseType }),
    );
    route.snapshot = { queryParamMap: convertToParamMap({}) };
    expect(component.signupQueryParams(catalog.tiers[0]).hasOwnProperty('from')).toBe(false);
  });
  // Launch P5 Task 12: the sales switch and the trial come from the catalog.
  describe('sales switch and catalog availability', () => {
    const render = (result: Observable<TierCatalog>): HTMLElement => {
      catalog$ = result;
      fixture = TestBed.createComponent(PricingOneComponent);
      component = fixture.componentInstance;
      fixture.detectChanges();
      return fixture.nativeElement as HTMLElement;
    };
    const text = (el: HTMLElement) => (el.textContent || '').replace(/\s+/g, ' ');

    it('with sales open, a for-sale tier links to checkout as "Start Free Trial"', () => {
      const el = render(of({ ...catalog, salesOpen: true }));
      const links = el.querySelectorAll('a.plan-checkout');
      expect(links.length).toBe(1);
      expect(text(links[0] as HTMLElement).trim()).toBe('Start Free Trial');
      expect(el.querySelectorAll('.plan-coming-soon').length).toBe(0);
    });

    it('with sales closed, shows "Coming soon" and no checkout link', () => {
      const el = render(of({ ...catalog, salesOpen: false }));
      expect(el.querySelectorAll('a.plan-checkout').length).toBe(0);
      const soon = el.querySelectorAll('.plan-coming-soon');
      expect(soon.length).toBe(1);
      expect(text(soon[0] as HTMLElement).trim()).toBe('Coming soon');
      expect(component.canCheckout(catalog.tiers[0])).toBe(false);
      expect(component.ctaLabel(catalog.tiers[0])).toBe('Coming soon');
      // The not-for-sale tier still points at sales, not at checkout.
      expect(component.ctaLabel(catalog.tiers[1])).toBe('Contact Sales');
    });

    it('with the catalog unavailable, shows no price, no trial and no checkout link', () => {
      const el = render(throwError(new Error('unavailable')));
      expect(component.error).toBe(true);
      expect(text(el)).toContain("We couldn't load current pricing");
      expect(text(el)).not.toMatch(/\$\s*\d/);
      expect(text(el)).not.toMatch(/\d+-day/i);
      expect(text(el)).not.toContain('Free Trial');
      expect(el.querySelectorAll('a.plan-checkout').length).toBe(0);
    });
  });
});
