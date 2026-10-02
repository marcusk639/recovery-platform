import { Component, EventEmitter, OnInit, Output } from '@angular/core';
import { Router } from '@angular/router';
import { TierCatalogService } from 'src/app/services/subscriptions/tier-catalog.service';
import {
  BillingInterval,
  HouseType,
  TierCatalog,
  TierCatalogEntry,
  TierSelection,
} from 'src/app/entities/TierCatalog';

type Step = 'houseType' | 'capacity' | 'confirm';

/**
 * Capacity-first plan picker shown on /signup when the URL doesn't carry a
 * valid houseType/tier. Asks what kind of home the operator runs and how
 * many residents (and properties, for Traditional) they need to house, then
 * recommends the cheapest for-sale tier that fits — pre-selected but
 * overridable against the rest of that ladder. If no for-sale tier in the
 * ladder covers the stated capacity, routes straight to /contact instead of
 * offering a plan that can't actually hold that many people.
 */
@Component({
  selector: 'tier-picker',
  templateUrl: './tier-picker.component.html',
  styleUrls: ['./tier-picker.component.css'],
})
export class TierPickerComponent implements OnInit {
  @Output() selected = new EventEmitter<TierSelection>();

  loading = true;
  error = false;
  step: Step = 'houseType';

  houseType: HouseType | null = null;
  residents: number | null = null;
  properties: number | null = null;

  catalog: TierCatalog | null = null;
  ladder: TierCatalogEntry[] = [];
  chosen: TierCatalogEntry | null = null;
  billingInterval: BillingInterval = 'month';

  constructor(
    private tierCatalog: TierCatalogService,
    private router: Router,
  ) {}

  ngOnInit(): void {
    this.tierCatalog.getCatalog().subscribe({
      next: (catalog) => {
        this.catalog = catalog;
        this.loading = false;
      },
      error: () => {
        this.error = true;
        this.loading = false;
      },
    });
  }

  get needsProperties(): boolean {
    return this.houseType === 'traditional';
  }

  get purchasableLadder(): TierCatalogEntry[] {
    return this.ladder.filter((t) => t.availableForSale);
  }

  chooseHouseType(houseType: HouseType): void {
    this.houseType = houseType;
    this.residents = null;
    this.properties = null;
    this.step = 'capacity';
  }

  submitCapacity(): void {
    if (!this.catalog || !this.houseType || !this.residents || this.residents < 1) {
      return;
    }
    this.ladder = [...this.catalog.tiers]
      .filter((t) => t.houseType === this.houseType)
      .sort((a, b) => this.monthAmount(a) - this.monthAmount(b));

    const fit = this.ladder.find((t) => this.fitsCapacity(t));

    if (!fit) {
      this.router.navigate(['/contact'], {
        queryParams: { reason: 'capacity', houseType: this.houseType },
      });
      return;
    }

    this.chosen = fit;
    this.step = 'confirm';
  }

  private fitsCapacity(tier: TierCatalogEntry): boolean {
    if (!tier.availableForSale) {
      return false;
    }
    const residentsFit =
      tier.maxResidents === null ||
      (this.residents !== null && this.residents <= tier.maxResidents);
    if (!residentsFit) {
      return false;
    }
    if (!this.needsProperties) {
      return true;
    }
    return tier.maxProperties === null || (this.properties ?? 1) <= tier.maxProperties;
  }

  private monthAmount(tier: TierCatalogEntry): number {
    return tier.prices.month ? tier.prices.month.amountCents : Number.MAX_SAFE_INTEGER;
  }

  choose(tier: TierCatalogEntry): void {
    this.chosen = tier;
  }

  formatAmount(tier: TierCatalogEntry): string {
    const cents = tier.prices.month ? tier.prices.month.amountCents : null;
    return cents === null ? 'Contact us' : `$${(cents / 100).toFixed(0)}/mo`;
  }

  back(): void {
    if (this.step === 'confirm') {
      this.step = 'capacity';
    } else if (this.step === 'capacity') {
      this.step = 'houseType';
    }
  }

  confirm(): void {
    if (!this.houseType || !this.chosen) {
      return;
    }
    this.selected.emit({
      houseType: this.houseType,
      tier: this.chosen.tier,
      period: this.billingInterval,
    });
  }
}
