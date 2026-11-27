import { Component, EventEmitter, Input, OnInit, Output } from '@angular/core';
import { User } from 'src/app/entities/User';
import { CloudFunctionService } from 'src/app/services/functions/cloud-function.service';
import { TierCatalogService } from 'src/app/services/subscriptions/tier-catalog.service';

const RESTARTABLE = ['canceled', 'cancelling'];
const LIVE = ['active', 'trialing'];

/**
 * my-account's way back to a plan (launch item M9, owner decision 2026-11-26).
 * - canceled: "Reactivate" creates a new subscription on the stored plan via
 *   reactivateOperatorSubscription. There is no trial, so the saved card is
 *   charged today; the confirm step says so, with the monthly price when the
 *   catalog has it.
 * - cancelling: "Resume" undoes the pending cancellation; no new charge.
 * - no plan at all (or the server refuses): "Choose a plan" opens /pricing.
 * The server re-checks everything (tier billing, sales switch, status), so
 * this component only decides what to offer.
 */
@Component({
  selector: 'app-plan-reactivate',
  templateUrl: './plan-reactivate.component.html',
})
export class PlanReactivateComponent implements OnInit {
  @Input() user: User;
  @Input() fromApp = false;
  @Output() reactivated = new EventEmitter<User>();

  confirming = false;
  pending = false;
  notice = '';
  error = '';
  showChoosePlan = false;
  private monthlyCents: number | null = null;

  constructor(
    private functions: CloudFunctionService,
    private tierCatalog: TierCatalogService,
  ) {}

  ngOnInit(): void {
    const meta = this.meta;
    if (!meta?.tier || !this.canRestart) return;
    this.tierCatalog.getCatalog().subscribe({
      next: (catalog) => {
        const entry = catalog.tiers.find(
          (t) => t.houseType === meta.houseType && t.tier === meta.tier,
        );
        this.monthlyCents = entry?.prices.month?.amountCents ?? null;
      },
      error: () => (this.monthlyCents = null),
    });
  }

  private get meta(): any {
    return (this.user as any)?.subscriptionMetadata;
  }

  get status(): string {
    return this.meta?.status || '';
  }

  get canRestart(): boolean {
    return RESTARTABLE.includes(this.status);
  }

  get hasNoPlan(): boolean {
    return !this.status;
  }

  get isResume(): boolean {
    return this.status === 'cancelling';
  }

  get choosePlanHref(): string {
    return this.fromApp ? '/pricing?from=app' : '/pricing';
  }

  get confirmText(): string {
    if (this.isResume) {
      return 'Resume your plan? Your cancellation is undone and billing continues as before.';
    }
    const price =
      this.monthlyCents !== null
        ? ` at $${(this.monthlyCents / 100).toFixed(2)}/month`
        : ' at its current price';
    return `Reactivate your plan${price}? Your saved card is charged today; there is no new free trial.`;
  }

  start(): void {
    this.error = '';
    this.notice = '';
    this.confirming = true;
  }

  cancel(): void {
    this.confirming = false;
  }

  async confirm(): Promise<void> {
    if (this.pending) return;
    this.pending = true;
    this.error = '';
    try {
      const updated: User = await this.functions.reactivateOperatorSubscription(this.user);
      const status = (updated as any)?.subscriptionMetadata?.status;
      this.confirming = false;
      this.notice = LIVE.includes(status)
        ? 'Your plan is active again.'
        : 'Your plan was restarted, but the payment needs attention. Use Manage Billing to complete it.';
      this.reactivated.emit(updated);
    } catch (err) {
      // HttpsError messages from the callable are written for operators.
      this.error =
        (err && (err as any).message) || 'Your plan could not be restarted. Please try again.';
      this.showChoosePlan = true;
      this.confirming = false;
    } finally {
      this.pending = false;
    }
  }
}
