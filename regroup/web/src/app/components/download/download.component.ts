import { Component, OnInit, Inject, PLATFORM_ID } from "@angular/core";
import { BaseComponent } from "../base.component";
import { isPlatformBrowser } from "@angular/common";

declare var $: any;

@Component({
  selector: "app-download",
  templateUrl: "./download.component.html",
  styleUrls: ["./download.component.css"],
})
export class DownloadComponent extends BaseComponent implements OnInit {
  constructor(@Inject(PLATFORM_ID) private platformId: Object) {
    super();
  }

  openGooglePlay() {
    if (!isPlatformBrowser(this.platformId)) return;
    window.location.href =
      "https://play.google.com/store/apps/details?id=com.regroup.app&hl=en&gl=US";
  }

  openAppStore() {
    if (!isPlatformBrowser(this.platformId)) return;
    window.location.href =
      "https://apps.apple.com/us/app/regroup-sober-living-app/id1502040260";
  }

  ngOnInit(): void {
    if (isPlatformBrowser(this.platformId)) {
      $(function () {
        $('[data-toggle="tooltip"]').tooltip();
      });
    }
  }
}
