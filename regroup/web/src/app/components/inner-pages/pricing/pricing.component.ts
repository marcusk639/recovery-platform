import {
  Component,
  OnInit,
  ViewChild,
  AfterViewInit,
  ElementRef,
} from "@angular/core";
import { AngularFireAnalytics } from "@angular/fire/analytics";
import { Router } from "@angular/router";
import { TierCatalogService } from "src/app/services/subscriptions/tier-catalog.service";

@Component({
  selector: "app-pricing",
  templateUrl: "./pricing.component.html",
  styleUrls: ["./pricing.component.css"],
})
export class PricingComponent implements OnInit {
  @ViewChild("floatingButton") floatingButton: ElementRef;
  /**
   * The floating sign-up button's label, from the catalog like the plan cards
   * (pricing-one): null, so no button, while sales are closed or the catalog
   * can't be read.
   */
  signUpLabel: string | null = null;

  constructor(
    private router: Router,
    private analytics: AngularFireAnalytics,
    private tierCatalog: TierCatalogService
  ) {}

  signUp() {
    this.analytics.logEvent("start-free-trial-clicked");
    this.router.navigate(["signup"]);
  }

  ngOnInit() {
    this.analytics.logEvent("pricing-page-accessed");
    this.tierCatalog.getCatalog().subscribe({
      next: (catalog) => {
        if (catalog.salesOpen !== true) {
          this.signUpLabel = null;
        } else {
          this.signUpLabel = catalog.trialDays > 0 ? "Start Free Trial" : "Get Started";
        }
      },
      error: () => {
        this.signUpLabel = null;
      },
    });
  }
}
