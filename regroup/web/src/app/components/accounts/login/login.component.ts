import { Component, OnInit, Inject, PLATFORM_ID } from "@angular/core";
import { isPlatformBrowser } from "@angular/common";
import { AuthService } from "src/app/services/auth/auth-service.service";
import { FormGroup } from "@angular/forms";
import { Router } from "@angular/router";

@Component({
  selector: "login",
  templateUrl: "./login.component.html",
  styleUrls: ["./login.component.css"],
})
export class LoginComponent implements OnInit {
  formGroup: FormGroup;
  loading: boolean = false;
  error: string = "";

  constructor(
    @Inject(PLATFORM_ID) private platformId: Object,
    private authService: AuthService,
    private router: Router,
  ) {}

  ngOnInit(): void {
    this.formGroup = this.authService.buildAuthForm(undefined, false);
  }

  get fromApp() {
    return (
      isPlatformBrowser(this.platformId) && (window as any).launchedFromMobile
    );
  }

  get isMobile() {
    if (!isPlatformBrowser(this.platformId)) return false;
    const win = window as any;
    return typeof win.isMobile === "function" && win.isMobile();
  }

  get valid() {
    return this.formGroup.valid;
  }

  async onSubmit() {
    this.loading = true;
    this.error = "";
    try {
      await this.authService.login(
        this.formGroup.get("email").value,
        this.formGroup.get("password").value,
      );
      this.router.navigate(["my-account"]);
    } catch (error) {
      if (
        error &&
        (error.code === "auth/wrong-password" ||
          error.code === "auth/user-not-found")
      ) {
        this.error = "Username or password is invalid";
      }
    } finally {
      this.loading = false;
    }
  }
}
