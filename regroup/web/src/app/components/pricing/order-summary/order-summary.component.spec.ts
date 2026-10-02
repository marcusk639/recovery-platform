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
    const expected = new Date();
    expected.setDate(expected.getDate() + component.trialDays);
    expect(component.firstChargeDate.toDateString()).toBe(expected.toDateString());
  });
});
