import { TestBed } from '@angular/core/testing';
import { AngularFireFunctions } from '@angular/fire/functions';
import { of } from 'rxjs';
import { CloudFunctionService } from './cloud-function.service';
import { User } from 'src/app/entities/User';

describe('CloudFunctionService', () => {
  let service: CloudFunctionService;
  let httpsCallable: jasmine.Spy;
  let callableFn: jasmine.Spy;

  beforeEach(() => {
    callableFn = jasmine.createSpy('callable').and.returnValue(of({ ok: true }));
    httpsCallable = jasmine.createSpy('httpsCallable').and.returnValue(callableFn);
    TestBed.configureTestingModule({
      providers: [{ provide: AngularFireFunctions, useValue: { httpsCallable } }],
    });
    service = TestBed.inject(CloudFunctionService);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });

  it('sends only narrowed user identifiers plus houseType/tier/billingInterval to createOperatorSubscription', async () => {
    const user = new User();
    user.id = 'uid-1';
    user.email = 'a@b.com';
    user.firstName = 'Should';
    user.lastName = 'NotBeSent';

    await service.initializeSubscription(user, 'pm_1', 'traditional', 'starter', 'year');

    expect(httpsCallable).toHaveBeenCalledWith('createOperatorSubscription');
    expect(callableFn).toHaveBeenCalledWith({
      user: { id: 'uid-1', email: 'a@b.com', subscriptionMetadata: undefined },
      paymentMethod: 'pm_1',
      houseType: 'traditional',
      tier: 'starter',
      billingInterval: 'year',
    });
  });

  it('fetches the tier catalog via the getTierCatalog callable', async () => {
    await service.getTierCatalog();
    expect(httpsCallable).toHaveBeenCalledWith('getTierCatalog');
    expect(callableFn).toHaveBeenCalledWith({});
  });
});
