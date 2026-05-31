import { Component, OnInit, Inject, PLATFORM_ID } from "@angular/core";
import { isPlatformBrowser } from "@angular/common";

@Component({
  selector: "app-scrollup",
  templateUrl: "./scrollup.component.html",
  styleUrls: ["./scrollup.component.css"],
})
export class ScrollupComponent implements OnInit {
  constructor(@Inject(PLATFORM_ID) private platformId: Object) {}

  ngOnInit(): void {}

  scrollUp() {
    if (!isPlatformBrowser(this.platformId)) return;
    window.scrollTo({ top: 0, behavior: "smooth" });
  }
}
