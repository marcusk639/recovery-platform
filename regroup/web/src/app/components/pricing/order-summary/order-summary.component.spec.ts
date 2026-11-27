import { async, ComponentFixture, TestBed } from '@angular/core/testing';
import { OrderSummaryComponent } from './order-summary.component';
import { TierCatalogEntry } from 'src/app/entities/TierCatalog';

const tier: TierCatalogEntry = {
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
  prices: { month: { amountCents: 6900 }, year: null },
};

describe('OrderSummaryComponent', () => {
  let component: OrderSummaryComponent;
  let fixture: ComponentFixture<OrderSummaryComponent>;

  beforeEach(async(() => {
    TestBed.configureTestingModule({
      declarations: [OrderSummaryComponent],
    }).compileComponents();
  }));

  beforeEach(() => {
    fixture = TestBed.createComponent(OrderSummaryComponent);
    component = fixture.componentInstance;
  });

  it('should create', () => {
    fixture.detectChanges();
    expect(component).toBeTruthy();
  });

  it('falls back to monthly when annual is requested but unavailable', () => {
    component.tier = tier;
    component.billingInterval = 'year';
    expect(component.effectiveInterval).toBe('month');
    expect(component.amountCents).toBe(6900);
  });

  it('uses the annual price when available', () => {
    component.tier = {
      ...tier,
      prices: { month: { amountCents: 6900 }, year: { amountCents: 69000 } },
    };
    component.billingInterval = 'year';
    expect(component.effectiveInterval).toBe('year');
    expect(component.amountCents).toBe(69000);
  });

  it('computes the first charge date as today plus the trial length', () => {
    component.tier = tier;
    component.trialDays = 5;
    const expected = new Date();
    expected.setDate(expected.getDate() + 5);
    expect(component.firstChargeDate.toDateString()).toBe(expected.toDateString());
  });

  // Launch P5 Task 12 (M12): the trial length is the catalog's, never the page's.
  describe('trial terms', () => {
    const text = (): string =>
      ((fixture.nativeElement as HTMLElement).textContent || '').replace(/\s+/g, ' ');

    it("renders the catalog's trialDays: a fixture with 5 shows a 5-day free trial", () => {
      component.tier = tier;
      component.trialDays = 5;
      fixture.detectChanges();
      expect(text()).toContain('5-day free trial.');
      expect(text()).not.toContain('7-day');
    });

    it('shows no trial line and no day count when the catalog gave no trial length', () => {
      component.tier = tier;
      component.trialDays = null;
      fixture.detectChanges();
      expect(text()).toContain('$69 / mo');
      expect(text()).not.toMatch(/\d+-day/);
      expect(text()).not.toContain('free trial');
    });

    it('shows no trial line for a zero-day trial', () => {
      component.tier = tier;
      component.trialDays = 0;
      fixture.detectChanges();
      expect(text()).not.toContain('free trial');
    });
  });
});
