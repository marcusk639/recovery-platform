import { async, ComponentFixture, TestBed } from '@angular/core/testing';
import { NO_ERRORS_SCHEMA } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { of, throwError } from 'rxjs';
import { TierPickerComponent } from './tier-picker.component';
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
      prices: { month: { amountCents: 6900 }, year: null },
    },
    {
      houseType: 'traditional',
      tier: 'enterprise',
      label: 'Traditional Enterprise',
      maxResidents: null,
      maxProperties: null,
      availableForSale: true,
      features: {
        automatedRentCollection: true,
        multiProperty: true,
        complianceExport: true,
        analytics: true,
        whiteLabel: true,
      },
      prices: { month: { amountCents: 24900 }, year: null },
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

describe('TierPickerComponent', () => {
  let component: TierPickerComponent;
  let fixture: ComponentFixture<TierPickerComponent>;
  let router: { navigate: jasmine.Spy };

  const configure = (getCatalog: jasmine.Spy) => {
    router = { navigate: jasmine.createSpy('navigate') };
    TestBed.configureTestingModule({
      imports: [FormsModule],
      declarations: [TierPickerComponent],
      schemas: [NO_ERRORS_SCHEMA],
      providers: [
        { provide: TierCatalogService, useValue: { getCatalog } },
        { provide: Router, useValue: router },
      ],
    }).compileComponents();
    fixture = TestBed.createComponent(TierPickerComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  };

  it('should create and load the catalog', () => {
    configure(jasmine.createSpy().and.returnValue(of(catalog)));
    expect(component).toBeTruthy();
    expect(component.loading).toBe(false);
    expect(component.catalog).toEqual(catalog);
  });

  it('shows an error state when the catalog fails to load', () => {
    configure(jasmine.createSpy().and.returnValue(throwError(new Error('boom'))));
    expect(component.error).toBe(true);
  });

  it('recommends the cheapest for-sale tier that fits stated capacity', () => {
    configure(jasmine.createSpy().and.returnValue(of(catalog)));
    component.chooseHouseType('traditional');
    component.residents = 5;
    component.properties = 1;
    component.submitCapacity();
    expect(component.step).toBe('confirm');
    expect(component.chosen.tier).toBe('starter');
  });

  it('routes to /contact when no for-sale tier covers the capacity', () => {
    configure(jasmine.createSpy().and.returnValue(of(catalog)));
    component.chooseHouseType('oxford');
    component.residents = 1000;
    component.submitCapacity();
    expect(router.navigate).toHaveBeenCalledWith(
      ['/contact'],
      jasmine.objectContaining({ queryParams: jasmine.objectContaining({ reason: 'capacity' }) }),
    );
  });

  it('emits the chosen selection on confirm', () => {
    configure(jasmine.createSpy().and.returnValue(of(catalog)));
    component.chooseHouseType('traditional');
    component.residents = 5;
    component.submitCapacity();
    const emitted: any[] = [];
    component.selected.subscribe((value) => emitted.push(value));
    component.confirm();
    expect(emitted).toEqual([{ houseType: 'traditional', tier: 'starter', period: 'month' }]);
  });
});
