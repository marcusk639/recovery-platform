import { async, ComponentFixture, TestBed } from '@angular/core/testing';
import { NO_ERRORS_SCHEMA } from '@angular/core';
import { ReactiveFormsModule } from '@angular/forms';
import { of } from 'rxjs';
import { BillingInfoComponent } from './billing-info.component';
import { AuthService } from 'src/app/services/auth/auth-service.service';
import { ModalService } from 'src/app/services/modal.service';
import { StripeService } from 'ngx-stripe';
import { AngularFireAnalytics } from '@angular/fire/analytics';

describe('BillingInfoComponent', () => {
  let component: BillingInfoComponent;
  let fixture: ComponentFixture<BillingInfoComponent>;

  beforeEach(async(() => {
    TestBed.configureTestingModule({
      imports: [ReactiveFormsModule],
      declarations: [BillingInfoComponent],
      schemas: [NO_ERRORS_SCHEMA],
      providers: [
        { provide: AuthService, useValue: {} },
        {
          provide: ModalService,
          useValue: { disableConfirm: false, onConfirm: null },
        },
        {
          provide: StripeService,
          useValue: {
            elements: () => of({ create: () => ({ on: () => {}, mount: () => {} }) }),
          },
        },
        {
          provide: AngularFireAnalytics,
          useValue: { logEvent: () => Promise.resolve() },
        },
      ],
    }).compileComponents();
  }));

  beforeEach(() => {
    fixture = TestBed.createComponent(BillingInfoComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('forwards houseType, tier, and billingInterval to subscribeOperator', async () => {
    const authService = TestBed.inject(AuthService) as any;
    authService.subscribeOperator = jasmine.createSpy('subscribeOperator').and.resolveTo({});
    authService.cachedDetails = { email: 'a@b.com' };
    authService.clearCachedDetails = () => {};
    component.houseType = 'traditional';
    component.tier = 'starter';
    component.billingInterval = 'year';
    component.initialSubscription = true;
    component.setLoading = () => {};
    component.setBillingCompleted = () => {};
    (component as any).stripeService = {
      stripe: {
        createPaymentMethod: () =>
          ({ toPromise: () => Promise.resolve({ paymentMethod: { id: 'pm_123' } }) }) as any,
      },
    };
    component.stripeTest.get('name').setValue('Test User');

    await component.buy();

    expect(authService.subscribeOperator).toHaveBeenCalledWith(
      component.user,
      'pm_123',
      'traditional',
      'starter',
      'year',
    );
  });

  // Launch P5 Task 9/11: the app has no WebView, so the page posts nothing to one.
  it('never calls ReactNativeWebView.postMessage after checkout', async () => {
    const postMessage = jasmine.createSpy('postMessage');
    (window as any).ReactNativeWebView = { postMessage };
    try {
      const authService = TestBed.inject(AuthService) as any;
      authService.subscribeOperator = jasmine.createSpy('subscribeOperator').and.resolveTo({});
      authService.cachedDetails = { email: 'a@rats-e2e.com' };
      authService.clearCachedDetails = jasmine.createSpy('clearCachedDetails');
      component.initialSubscription = true;
      component.setLoading = () => {};
      component.setBillingCompleted = () => {};
      (component as any).stripeService = {
        stripe: {
          createPaymentMethod: () =>
            ({ toPromise: () => Promise.resolve({ paymentMethod: { id: 'pm_123' } }) }) as any,
        },
      };
      component.stripeTest.get('name').setValue('Test User');
      await component.buy();
      expect(postMessage).not.toHaveBeenCalled();
      expect(authService.clearCachedDetails).toHaveBeenCalled();
    } finally {
      delete (window as any).ReactNativeWebView;
    }
  });
});
