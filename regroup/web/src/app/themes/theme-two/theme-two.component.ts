import {
  Component,
  OnInit,
  AfterViewInit,
  Inject,
  PLATFORM_ID,
} from "@angular/core";
import { isPlatformBrowser } from "@angular/common";
import { Router, ActivatedRoute } from "@angular/router";

@Component({
  selector: "app-theme-two",
  templateUrl: "./theme-two.component.html",
  styleUrls: ["./theme-two.component.css"],
})
export class ThemeTwoComponent implements OnInit, AfterViewInit {
  constructor(
    protected route: ActivatedRoute,
    @Inject(PLATFORM_ID) private platformId: Object,
  ) {}

  ngAfterViewInit() {
    if (!isPlatformBrowser(this.platformId)) return;
    this.route.queryParams.subscribe((params) => {
      const element = document.getElementById(params.section);
      if (element) {
        window.setTimeout(() => {
          element.scrollIntoView({ behavior: "smooth", block: "start" });
        });
      }
    });
  }

  ngOnInit(): void {}
}
