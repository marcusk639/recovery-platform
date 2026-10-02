import { Component, OnInit, ViewChild, Input, Output, EventEmitter } from '@angular/core';
import { FormGroup, FormBuilder, Validators } from '@angular/forms';
import {
  StripeService,
  Elements,
  Element as StripeElement,
  ElementsOptions,
  StripeCardComponent,
  ElementOptions,
} from 'ngx-stripe';
import { User } from 'src/app/entities/User';
import { AuthService } from 'src/app/services/auth/auth-service.service';
import { PaymentMethod } from 'ngx-stripe/lib/interfaces/payment-intent';
import { ModalService } from 'src/app/services/modal.service';
import { analytics } from 'firebase';
import { AngularFireAnalytics } from '@angular/fire/analytics';
import { BillingInterval, HouseType } from 'src/app/entities/TierCatalog';

@Component({
  selector: 'billing-info',
  templateUrl: './billing-info.component.html',
  styleUrls: ['./billing-info.component.css'],
})
export class BillingInfoComponent implements OnInit {
  @Input() formGroup: FormGroup;
  @Input() user: User;
  @Input() setBillingCompleted: (value: boolean) => any;
  @Input() setSubmitPaymentInfo?: (submitFn: () => any) => any;
  @Output() onSubmit?: EventEmitter<any> = new EventEmitter();
  @Input() setLoading: (value: boolean) => any;
  @Input() loading: boolean = false;
  @Input() showSubmit?: boolean = true;
  @Input() initialSubscription: boolean = false;
  @Input() houseType: HouseType;
  @Input() tier: string;
  @Input() billingInterval: BillingInterval = 'month';

  elements: Elements;
  cardNumber: StripeElement;
  cardExpiration: StripeElement;
  cardCvc: StripeElement;

  // optional parameters
  elementsOptions: ElementsOptions = {
    locale: 'en',
  };

  elementStyles: ElementOptions = {
    //@ts-ignore
    classes: {
      base: 'StripeElement',
      focus: 'StripeElement',
      empty: 'StripeElement',
    },
    style: {
      base: {
        color: '#495057',
        // lineHeight: '30px',
        fontFamily: 'system-ui',
        fontSize: '14px',
        fontStyle: 'black',
        '::placeholder': {
          color: 'rgba(68, 68, 68, 0.6)',
        },
      },
    },
  };

  stripeTest: FormGroup;

  constructor(
    private fb: FormBuilder,
    private stripeService: StripeService,
    private authService: AuthService,
    private modalService: ModalService,
    private analytics: AngularFireAnalytics,
  ) {}

  getElementStyles(type?: 'Expiration' | 'Cvc') {
    const prefix = type || 'Stripe';
    const className = `StripeElement ${prefix}Element`;
    return {
      classes: {
        base: className,
        focus: className,
        empty: className,
      },
      style: {
        base: {
          color: '#495057',
          // lineHeight: '50px',
          fontFamily: 'system-ui',
          fontSize: '14px',
          fontStyle: 'black',
          '::placeholder': {
            color: 'rgba(68, 68, 68, 0.6)',
          },
        },
      },
    };
  }

  displayErrors(id: string, event: any) {
    const displayError = document.getElementById(id);
    if (event.error) {
      displayError.textContent = event.error.message;
      this.modalService.disableConfirm = true;
    } else {
      displayError.textContent = '';
      this.modalService.disableConfirm = false;
    }
  }

  setSubmitFn() {
    this.modalService.onConfirm = this.buy.bind(this);
  }

  ngOnInit() {
    this.stripeTest = this.fb.group({
      name: ['', [Validators.required]],
    });
    this.stripeService.elements(this.elementsOptions).subscribe((elements) => {
      this.elements = elements;
      // Only mount the element the first time
      if (!this.cardNumber) {
        this.cardNumber = this.elements.create('cardNumber', this.getElementStyles());
        this.cardNumber.on('change', (event) => this.displayErrors('card-errors', event));
      }
      if (!this.cardExpiration) {
        this.cardExpiration = this.elements.create(
          'cardExpiry',
          this.getElementStyles('Expiration'),
        );
        this.cardExpiration.on('change', (event) => this.displayErrors('exp-errors', event));
      }
      if (!this.cardCvc) {
        this.cardCvc = this.elements.create('cardCvc', {
          ...this.getElementStyles('Cvc'),
          placeholder: 'CVV',
        });
        this.cardCvc.on('change', (event) => this.displayErrors('cvc-errors', event));
      }
      this.cardNumber.mount('#card-number');
      this.cardExpiration.mount('#card-expiration');
      this.cardCvc.mount('#card-cvc');
    });
    this.setSubmitFn();
  }

  buy() {
    const name = this.stripeTest.get('name').value;
    this.setLoading(true);
    return (
      this.stripeService.stripe
        //@ts-ignore
        .createPaymentMethod('card', this.cardNumber, {
          billing_details: { name },
        })
        .toPromise()
        .then(async (result) => {
          if (result.paymentMethod) {
            // should be if this.onsubmit && !initialSubscription
            if (this.onSubmit && !this.initialSubscription) {
              this.onSubmit.emit({
                user: this.user,
                paymentMethod: result.paymentMethod,
              });
            } else {
              await this.authService.subscribeOperator(
                this.user,
                result.paymentMethod.id,
                this.houseType,
                this.tier,
                this.billingInterval,
              );
              this.analytics.logEvent('subscription-created');
              this.setBillingCompleted(true);
              this.setLoading(false);
              try {
                const email =
                  this.authService.cachedDetails && this.authService.cachedDetails.email;
                if (
                  typeof window !== 'undefined' &&
                  //@ts-ignore
                  window.ReactNativeWebView &&
                  email
                ) {
                  //@ts-ignore
                  window.ReactNativeWebView.postMessage(
                    JSON.stringify({ event: 'signup-complete', email }),
                  );
                }
              } catch (error) {
                // postMessage failed; non-fatal
              } finally {
                this.authService.clearCachedDetails();
              }
            }
          } else if (result.error) {
            this.setLoading(false);
            this.displayErrors('card-errors', result.error);
          }
        })
        .catch((error) => {
          this.setLoading(false);
          // Surface the callable's message when available (e.g. a declined
          // card or a subscription validation error) rather than a generic
          // message that hides why checkout failed.
          const message = (error && (error as any).message) || 'Payment failed. Please try again.';
          this.displayErrors('card-errors', { error: { message } });
          this.authService.clearCachedDetails();
        })
    );
  }
}
