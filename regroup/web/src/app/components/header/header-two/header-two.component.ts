import {
  Component,
  OnInit,
  Renderer2,
  Inject,
  PLATFORM_ID,
  Input,
} from "@angular/core";
import { Router } from "@angular/router";
import AppService from "src/app/services/app-service/app.service";
import { isPlatformBrowser, Location } from "@angular/common";
import { AuthService } from "src/app/services/auth/auth-service.service";

declare var $: any;

@Component({
  selector: "app-header-two",
  templateUrl: "./header-two.component.html",
  styleUrls: ["./header-two.component.css"],
})
export class HeaderTwoComponent implements OnInit {
  @Input()
  logoFileName?: string;

  logoFilePath: string;

  keyboardIsOpen = false;

  constructor(
    private appService: AppService,
    @Inject(PLATFORM_ID) private platformId: Object,
    private location: Location,
    private router: Router,
    private authService: AuthService,
  ) {}

  get show() {
    if (!isPlatformBrowser(this.platformId)) return true;
    const isMobile =
      typeof (window as any).isMobile === "function" &&
      (window as any).isMobile();
    return !(isMobile && this.keyboardIsOpen);
  }

  route = (route: string) => {
    return this.appService.route(route);
  };

  params(section: string) {
    return {
      section,
    };
  }

  async logout() {
    try {
      await this.authService.logout();
      await this.route("");
      this.authService.user = null;
    } catch (error) {
      console.error(error);
    }
  }

  get user() {
    return this.authService.user;
  }

  get fromApp() {
    return (
      isPlatformBrowser(this.platformId) && (window as any).launchedFromMobile
    );
  }

  back() {
    if (!isPlatformBrowser(this.platformId)) return;
    const rnWebView =
      this.router.url === "/pricing" && (window as any).ReactNativeWebView;
    if (rnWebView) {
      rnWebView.postMessage(JSON.stringify({ back: true }));
    } else {
      this.location.back();
    }
  }

  onVirtualKeyboard(isOpen: boolean) {
    this.keyboardIsOpen = isOpen;
  }

  ngOnInit() {
    this.logoFilePath = `assets/img/${this.logoFileName || "logo"}.png`;
    if (isPlatformBrowser(this.platformId)) {
      $(document).on(
        "focus blur",
        "select, textarea, input[type=text], input[type=date], input[type=password], input[type=email], input[type=number]",
        function (e) {
          var $obj = $(this);
          var nowWithKeyboard = e.type == "focusin";
          this.onVirtualKeyboard(nowWithKeyboard);
        }.bind(this),
      );
    }
  }

  toggleDrawer(inMenu: boolean = false) {
    $(".navbar").toggleClass("active");
    if (!inMenu) {
      $("body").toggleClass("canvas-open");
    }
    $(".navbar-toggler-icon").toggleClass("active");
  }
}
