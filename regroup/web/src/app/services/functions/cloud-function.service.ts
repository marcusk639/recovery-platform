import { Injectable } from '@angular/core';
import { AngularFireFunctions } from '@angular/fire/functions';
import { EmailConfirmationPayload } from 'src/app/entities/Email';
import { User } from 'src/app/entities/User';
import { PaymentMethod } from 'ngx-stripe/lib/interfaces/payment-intent';
import { BillingInterval, HouseType, TierCatalog } from 'src/app/entities/TierCatalog';

@Injectable({
  providedIn: 'root',
})
export class CloudFunctionService {
  constructor(protected functions: AngularFireFunctions) {}

  sendConfirmationEmail(payload: EmailConfirmationPayload): Promise<any> {
    // return auth.currentUser.sendEmailVerification();
    return this.functions.httpsCallable('sendConfirmationEmail')(payload).toPromise();
  }

  confirmEmail(userId: string) {
    return this.functions.httpsCallable('verifyUserEmail')({ userId }).toPromise();
  }

  initializeSubscription(
    user: User,
    paymentMethod: string,
    houseType: HouseType,
    tier: string,
    billingInterval?: BillingInterval,
  ) {
    // Forward only the identifiers the callable requires — never the full
    // User PII object. The createOperatorSubscription callable validates
    // user.{ id, email, subscriptionMetadata }, the payment method id, and
    // the houseType/tier/billingInterval selected on the pricing page.
    const userIdentifiers = {
      id: user.id,
      email: user.email,
      subscriptionMetadata: user.subscriptionMetadata,
    };
    return this.functions
      .httpsCallable('createOperatorSubscription')({
        user: userIdentifiers,
        paymentMethod,
        houseType,
        tier,
        billingInterval,
      })
      .toPromise();
  }

  getTierCatalog(): Promise<TierCatalog> {
    return this.functions.httpsCallable('getTierCatalog')({}).toPromise();
  }

  getPaymentMethod(user: User) {
    if (user.subscriptionMetadata && user.subscriptionMetadata.customerId) {
      return this.functions
        .httpsCallable('getPaymentMethod')({ customerId: user.subscriptionMetadata.customerId })
        .toPromise();
    }
    console.error('Customer not found');
  }

  updatePaymentInfo(user: User, paymentMethod: string) {
    return this.functions.httpsCallable('updatePaymentInfo')({ user, paymentMethod }).toPromise();
  }
  // export const cancelUserSubscription = functions.https.onCall(async (data: { user: User; subscriptionId: string }) => {
  cancelSubscription(user: User, subscriptionId: string) {
    return this.functions
      .httpsCallable('cancelUserSubscription')({ user, subscriptionId })
      .toPromise();
  }

  reactivateOperatorSubscription(user: User) {
    return this.functions.httpsCallable('reactivateOperatorSubscription')({ user }).toPromise();
  }

  createBillingPortalSession(returnUrl: string): Promise<{ url: string }> {
    return this.functions.httpsCallable('createBillingPortalSession')({ returnUrl }).toPromise();
  }
}
