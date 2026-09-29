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
    if (this.billingCompleted) {
      // go back to the mobile app
    }
  };

  get fromApp() {
    //@ts-ignore
    return isPlatformBrowser(this.platformId) && window.launchedFromMobile;
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

    if (!houseType || !tier) {
      this.pickerVisible = true;
      this.selectedTier = null;
      this.resolvingTier = false;
      return;
    }

    this.tierCatalog.getCatalog().subscribe({
      next: (catalog) => {
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
      },
      error: () => {
        this.catalogError = true;
        this.resolvingTier = false;
      },
    });
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
