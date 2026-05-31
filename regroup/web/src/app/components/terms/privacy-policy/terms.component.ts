import {
  Component,
  OnInit,
  NO_ERRORS_SCHEMA,
  ViewChild,
  AfterViewInit,
  ElementRef,
  Inject,
  PLATFORM_ID,
} from "@angular/core";
import { isPlatformBrowser } from "@angular/common";
import terms from "./terms";

@Component({
  selector: "terms",
  templateUrl: "./terms.component.html",
  styleUrls: ["./terms.component.css"],
})
export class TermsComponent implements OnInit, AfterViewInit {
  @ViewChild("terms") termsElement: ElementRef;

  constructor(@Inject(PLATFORM_ID) private platformId: Object) {}

  ngOnInit(): void {}

  ngAfterViewInit() {
    if (!isPlatformBrowser(this.platformId)) return;
    this.termsElement.nativeElement.innerHTML = terms;
    window.scrollTo(0, 0);
  }
}
