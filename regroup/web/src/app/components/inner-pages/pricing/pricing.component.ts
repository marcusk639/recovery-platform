import {
  Component,
  OnInit,
  ViewChild,
  AfterViewInit,
  ElementRef,
} from "@angular/core";
import { AngularFireAnalytics } from "@angular/fire/analytics";
import { Router } from "@angular/router";

@Component({
  selector: "app-pricing",
  templateUrl: "./pricing.component.html",
  styleUrls: ["./pricing.component.css"],
})
export class PricingComponent implements OnInit {
  @ViewChild("floatingButton") floatingButton: ElementRef;

  constructor(
    private router: Router,
    private analytics: AngularFireAnalytics
  ) {}

  signUp() {
    this.analytics.logEvent("start-free-trial-clicked");
    this.router.navigate(["signup"]);
  }

  ngOnInit() {
    this.analytics.logEvent("pricing-page-accessed");
  }
}
