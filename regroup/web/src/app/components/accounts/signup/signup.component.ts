import { Component, OnInit, Inject, PLATFORM_ID } from '@angular/core';
import { ActivatedRoute, ParamMap, Router } from '@angular/router';
import { AuthService } from 'src/app/services/auth/auth-service.service';
import { FormGroup } from '@angular/forms';
import { User, createSuperAdmin } from 'src/app/entities/User';
import { BetaService } from 'src/app/services/beta.service';
import { isPlatformBrowser } from '@angular/common';
import { AngularFireAnalytics } from '@angular/fire/analytics';
import { TierCatalogService } from 'src/app/services/subscriptions/tier-catalog.service';
import {
  BillingInterval,
  HouseType,
  TierCatalogEntry,
  TierSelection,
} from 'src/app/entities/TierCatalog';

export type AccountNotice = 'plan-exists' | 'plan-ended' | 'not-operator-account';

/**
 * Mirrors createOperatorSubscription's refusals (util/checkoutGuard.ts) from the
 * signed-in account's record, so the page says so before asking for a card. The
 * server decides; this only picks what to show.
 */
export function accountNoticeFor(account: User): AccountNotice | null {
  const meta: any = account.subscriptionMetadata || {};
  const status = meta.status || '';
  if (status === 'canceled') {
    if (meta.tier) {
      return 'plan-ended';
    }
  } else if (status || meta.subscriptionId) {
    return 'plan-exists';
  }
  if (account.isGuest || (account.isAdmin && !account.isSuperAdmin)) {
    return 'not-operator-account';
  }
  return null;
}

@Component({
  selector: 'app-signup',
  templateUrl: './signup.component.html',
  styleUrls: ['./signup.component.css'],
})
export class SignupComponent implements OnInit {
  formGroup: FormGroup;
  loading: boolean = false;
  error: string = '';
  signUpStarted: boolean = false;
  billingCompleted: boolean = false;
  user: User;

  // Tier selection — read from the query string (?houseType=&tier=&period=)
  // and validated against the live catalog. When missing or invalid, the
  // capacity-first picker is shown instead of a silent default.
  pickerVisible: boolean = false;
  resolvingTier: boolean = true;
  catalogError: boolean = false;
  selectedTier: TierCatalogEntry | null = null;
  billingInterval: BillingInterval = 'month';
  // From the catalog: the sales switch (config/sales.open) and the trial
  // length (TRIAL_PERIOD_DAYS). Sales closed shows "Coming soon" and never
  // reaches the card form, so createOperatorSubscription is never called.
  salesClosed = false;
  trialDays: number | null = null;
  // Signed in as a non-anonymous web user (launch item M9): no account step and
  // no email-in-use check; the card step checks out this account, and a failure
  // never deletes it. checkingAccount holds the account step until it's known.
  account: User | null = null;
  checkingAccount = true;
  accountNotice: AccountNotice | null = null;

  constructor(
    private auth: AuthService,
    private betaService: BetaService,
    @Inject(PLATFORM_ID) private platformId: Object,
    private analytics: AngularFireAnalytics,
    private route: ActivatedRoute,
    private router: Router,
    private tierCatalog: TierCatalogService,
  ) {}

  setBillingCompleted = (value: boolean) => {
    this.billingCompleted = value;
    // Opened from the app (?from=app, services/webBilling.ts): hand back to it.
    // The /checkout-return page offers "Return to Regroup".
    if (this.billingCompleted && this.fromApp) {
      this.router.navigate(['/checkout-return'], { queryParams: { result: 'success' } });
    }
  };

  get fromApp(): boolean {
    return this.route.snapshot?.queryParamMap?.get('from') === 'app';
  }

  get accountQueryParams() {
    return this.fromApp ? { from: 'app' } : {};
  }

  get valid() {
    return this.formGroup.valid;
  }

  get isMobile() {
    if (!isPlatformBrowser(this.platformId)) return false;
    const win = window as any;
    return typeof win.isMobile === 'function' && win.isMobile();
  }

  setLoading = (value: boolean) => {
    this.loading = value;
  };

  ngOnInit(): void {
    this.loadSignedInAccount();
    this.formGroup = this.auth.buildAuthForm();
    this.formGroup.get('email').valueChanges.subscribe((value) => {
      this.error = '';
    });
    this.route.queryParamMap.subscribe((params) => this.resolveTierFromParams(params));
  }

  private resolveTierFromParams(params: ParamMap): void {
    const houseType = params.get('houseType') as HouseType | null;
    const tier = params.get('tier');
    const period = params.get('period');

    this.tierCatalog.getCatalog().subscribe({
      next: (catalog) => {
        this.trialDays = catalog.trialDays > 0 ? catalog.trialDays : null;
        if (catalog.salesOpen !== true) {
          this.salesClosed = true;
          this.pickerVisible = false;
          this.selectedTier = null;
          this.resolvingTier = false;
          return;
        }
        this.salesClosed = false;

        if (!houseType || !tier) {
          this.pickerVisible = true;
          this.selectedTier = null;
          this.resolvingTier = false;
          return;
        }

        const match = catalog.tiers.find((t) => t.houseType === houseType && t.tier === tier);
        if (!match || !match.availableForSale) {
          // Unknown or not-for-sale tier — never fall back to a silent
          // default, send the user through the picker instead.
          this.pickerVisible = true;
          this.selectedTier = null;
          this.resolvingTier = false;
          return;
        }
        this.selectedTier = match;
        this.billingInterval = period === 'year' && match.prices.year ? 'year' : 'month';
        this.pickerVisible = false;
        this.resolvingTier = false;
        this.startExistingCheckout();
      },
      error: () => {
        // The picker step shows the error in place of the picker: no plan,
        // no price and no card form without a catalog.
        this.catalogError = true;
        this.pickerVisible = true;
        this.selectedTier = null;
        this.resolvingTier = false;
      },
    });
  }

  private async loadSignedInAccount(): Promise<void> {
    if (!isPlatformBrowser(this.platformId)) {
      // Server render: no Firebase session. The browser re-checks on load.
      this.checkingAccount = false;
      return;
    }
    try {
      this.account = await this.auth.signedInAccount();
    } catch {
      this.account = null;
    }
    this.accountNotice = this.account ? accountNoticeFor(this.account) : null;
    this.checkingAccount = false;
    this.startExistingCheckout();
  }

  /** Once both the account and a plan are known, go straight to the card step. */
  private startExistingCheckout(): void {
    if (!this.account || this.accountNotice || !this.selectedTier || this.salesClosed) {
      return;
    }
    this.user = this.account;
    this.signUpStarted = true;
  }

  async signOut(): Promise<void> {
    await this.auth.logout();
    this.account = null;
    this.accountNotice = null;
    this.user = undefined;
    this.signUpStarted = false;
  }

  onTierSelected(selection: TierSelection): void {
    this.router.navigate([], {
      relativeTo: this.route,
      queryParams: selection,
      queryParamsHandling: 'merge',
      replaceUrl: true,
    });
  }

  parseName(fullName: string) {
    const parts = fullName && fullName.split(' ');
    let firstName = '';
    let lastName = '';
    if (parts && parts.length) {
      firstName = parts[0];
      lastName = parts[1] ? parts[1] : '';
    }
    return [firstName, lastName];
  }

  async validateEmail(email: string) {
    const userExists = await this.auth.userWithEmailExists(email);
    if (userExists) {
      this.error = 'This email address is already in use.';
      return false;
    }
    return true;
  }

  async onSubmit() {
    if (this.salesClosed || !this.selectedTier) {
      return;
    }
    this.loading = true;
    const [firstName, lastName] = this.parseName(this.formGroup.value.fullName);
    const user = new User();
    user.firstName = firstName;
    user.lastName = lastName;
    user.password = this.formGroup.get('password').value;
    user.email = this.auth.cachedDetails.email = (
      this.formGroup.value.email as string
    ).toLowerCase();
    try {
      const valid = await this.validateEmail(user.email);
      this.analytics.logEvent('signup-started');
      if (valid) {
        this.user = user;
        this.signUpStarted = true;
      }
    } catch (error) {
      // invalid user
      console.error(error);
    }
    this.loading = false;
  }
}
