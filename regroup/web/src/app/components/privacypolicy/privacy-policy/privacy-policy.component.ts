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
import policy from "./privacy-policy";

@Component({
  selector: "app-privacy-policy",
  templateUrl: "./privacy-policy.component.html",
  styleUrls: ["./privacy-policy.component.css"],
})
export class PrivacyPolicyComponent implements OnInit, AfterViewInit {
  @ViewChild("policy") policyElement: ElementRef;

  constructor(@Inject(PLATFORM_ID) private platformId: Object) {}

  ngOnInit(): void {}

  ngAfterViewInit() {
    if (!isPlatformBrowser(this.platformId)) return;
    this.policyElement.nativeElement.innerHTML = policy;
    window.scrollTo(0, 0);
  }
}
