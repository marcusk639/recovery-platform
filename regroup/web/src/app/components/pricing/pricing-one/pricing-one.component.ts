import { Component, OnInit } from '@angular/core';
import { environment } from '../../../../environments/environment';
import { BaseComponent } from '../../base.component';
import { TierCatalogService } from 'src/app/services/subscriptions/tier-catalog.service';
import { BillingInterval, TierCatalogEntry } from 'src/app/entities/TierCatalog';

@Component({
  selector: 'app-pricing-one',
  templateUrl: './pricing-one.component.html',
  styleUrls: ['./pricing-one.component.css'],
})
export class PricingOneComponent extends BaseComponent implements OnInit {
  logoFilePath: string;
  logoFileName: string;

  loading = true;
  error = false;
  billingInterval: BillingInterval = 'month';
  traditionalTiers: TierCatalogEntry[] = [];
  oxfordTiers: TierCatalogEntry[] = [];

  constructor(private tierCatalog: TierCatalogService) {
    super();
  }

  ngOnInit(): void {
    this.logoFilePath = `assets/img/${this.logoFileName || 'logo'}.png`;
    this.tierCatalog.getCatalog().subscribe({
      next: (catalog) => {
        this.traditionalTiers = this.sortByMonthlyAmount(
          catalog.tiers.filter((t) => t.houseType === 'traditional'),
        );
        this.oxfordTiers = this.sortByMonthlyAmount(
          catalog.tiers.filter((t) => t.houseType === 'oxford'),
        );
        this.loading = false;
      },
      error: () => {
        this.error = true;
        this.loading = false;
      },
    });
  }

  setBillingInterval(interval: BillingInterval): void {
    this.billingInterval = interval;
  }

  /**
   * The interval actually applied to this tier — falls back to monthly if
   * annual was requested but this tier has no annual price configured.
   */
  effectiveInterval(tier: TierCatalogEntry): BillingInterval {
    return this.billingInterval === 'year' && !tier.prices.year ? 'month' : this.billingInterval;
  }

  hasAnnual(tier: TierCatalogEntry): boolean {
    return !!tier.prices.year;
  }

  amountCents(tier: TierCatalogEntry): number | null {
    const price = tier.prices[this.effectiveInterval(tier)];
    return price ? price.amountCents : null;
  }

  formatAmount(tier: TierCatalogEntry): string {
    const cents = this.amountCents(tier);
    if (cents === null) {
      return '';
    }
    return (cents / 100).toFixed(cents % 100 === 0 ? 0 : 2);
  }

  /** Real annual savings computed from the two prices — never hardcoded. */
  annualSavingsPct(tier: TierCatalogEntry): number | null {
    if (!tier.prices.year || !tier.prices.month) {
      return null;
    }
    const monthlyEquivalent = tier.prices.year.amountCents / 12;
    const pct = Math.round((1 - monthlyEquivalent / tier.prices.month.amountCents) * 100);
    return pct > 0 ? pct : null;
  }

  isHighlighted(tier: TierCatalogEntry): boolean {
    return tier.houseType === 'traditional' && tier.tier === 'professional';
  }

  ctaRoute(tier: TierCatalogEntry): string[] {
    return tier.availableForSale ? ['/signup'] : ['/contact'];
  }

  ctaLabel(tier: TierCatalogEntry): string {
    return tier.availableForSale ? 'Start Free Trial' : 'Contact Sales';
  }

  signupQueryParams(tier: TierCatalogEntry) {
    return {
      houseType: tier.houseType,
      tier: tier.tier,
      period: this.effectiveInterval(tier),
    };
  }

  private sortByMonthlyAmount(tiers: TierCatalogEntry[]): TierCatalogEntry[] {
    return [...tiers].sort((a, b) => {
      const aAmount = a.prices.month ? a.prices.month.amountCents : Number.MAX_SAFE_INTEGER;
      const bAmount = b.prices.month ? b.prices.month.amountCents : Number.MAX_SAFE_INTEGER;
      return aAmount - bAmount;
    });
  }
}
