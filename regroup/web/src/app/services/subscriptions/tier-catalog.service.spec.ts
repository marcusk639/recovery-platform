import { TestBed } from '@angular/core/testing';
import { TierCatalogService } from './tier-catalog.service';
import { CloudFunctionService } from '../functions/cloud-function.service';
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
  ],
};

describe('TierCatalogService', () => {
  let service: TierCatalogService;
  let getTierCatalog: jasmine.Spy;

  beforeEach(() => {
    getTierCatalog = jasmine.createSpy('getTierCatalog');
    TestBed.configureTestingModule({
      providers: [{ provide: CloudFunctionService, useValue: { getTierCatalog } }],
    });
    service = TestBed.inject(TierCatalogService);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });

  it('fetches the catalog from the callable', (done) => {
    getTierCatalog.and.returnValue(Promise.resolve(catalog));
    service.getCatalog().subscribe((result) => {
      expect(result).toEqual(catalog);
      expect(getTierCatalog).toHaveBeenCalledTimes(1);
      done();
    });
  });

  it('caches the catalog across subscribers for the session', (done) => {
    getTierCatalog.and.returnValue(Promise.resolve(catalog));
    service.getCatalog().subscribe(() => {
      service.getCatalog().subscribe(() => {
        expect(getTierCatalog).toHaveBeenCalledTimes(1);
        done();
      });
    });
  });

  it('clears the cache on failure so a retry hits the callable again', (done) => {
    getTierCatalog.and.returnValue(Promise.reject(new Error('network')));
    service.getCatalog().subscribe({
      error: () => {
        getTierCatalog.and.returnValue(Promise.resolve(catalog));
        service.getCatalog().subscribe((result) => {
          expect(result).toEqual(catalog);
          expect(getTierCatalog).toHaveBeenCalledTimes(2);
          done();
        });
      },
    });
  });
});
