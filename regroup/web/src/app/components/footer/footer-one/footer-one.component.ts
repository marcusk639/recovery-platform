import { Component, OnInit, Inject, PLATFORM_ID } from "@angular/core";
import { isPlatformBrowser } from "@angular/common";
import { BaseComponent } from "../../base.component";
import { Router } from "@angular/router";

@Component({
  selector: "app-footer-one",
  templateUrl: "./footer-one.component.html",
  styleUrls: ["./footer-one.component.css"],
})
export class FooterOneComponent extends BaseComponent implements OnInit {
  constructor(
    protected router: Router,
    @Inject(PLATFORM_ID) private platformId: Object,
  ) {
    super();
  }

  openGooglePlay() {
    if (!isPlatformBrowser(this.platformId)) return;
    window.location.href =
      "https://play.google.com/store/apps/details?id=com.rats.dev&hl=en&gl=US";
  }

  openAppStore() {
    if (!isPlatformBrowser(this.platformId)) return;
    window.location.href =
      "https://apps.apple.com/us/app/regroup-sober-living-app/id1502040260";
  }

  scroll(): void {
    if (!isPlatformBrowser(this.platformId)) return;
    if (this.router.url === "/") {
      window.scroll({ top: 0, behavior: "smooth" });
    }
  }
}
