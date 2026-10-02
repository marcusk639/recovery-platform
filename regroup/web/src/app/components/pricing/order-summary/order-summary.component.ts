import { Component, Input } from '@angular/core';
import { BillingInterval, TierCatalogEntry } from 'src/app/entities/TierCatalog';

const TRIAL_DAYS = 7;

/**
 * Presentational summary of the plan being purchased. Rendered on both
 * account-details and billing steps of /signup so the amount and trial
 * terms are visible before any card field is reachable.
 */
@Component({
  selector: 'order-summary',
  templateUrl: './order-summary.component.html',
  styleUrls: ['./order-summary.component.css'],
})
export class OrderSummaryComponent {
  @Input() tier: TierCatalogEntry;
  @Input() billingInterval: BillingInterval = 'month';

  get effectiveInterval(): BillingInterval {
    if (!this.tier) {
      return this.billingInterval;
    }
    return this.billingInterval === 'year' && !this.tier.prices.year
      ? 'month'
      : this.billingInterval;
  }

  get amountCents(): number | null {
    if (!this.tier) {
      return null;
    }
    const price = this.tier.prices[this.effectiveInterval];
    return price ? price.amountCents : null;
  }

  get formattedAmount(): string {
    const cents = this.amountCents;
    if (cents === null) {
      return '';
    }
    return `$${(cents / 100).toFixed(cents % 100 === 0 ? 0 : 2)}`;
  }

  get trialDays(): number {
    return TRIAL_DAYS;
  }

  /** Date the first charge occurs — today + the trial length. */
  get firstChargeDate(): Date {
    const date = new Date();
    date.setDate(date.getDate() + TRIAL_DAYS);
    return date;
  }
}
