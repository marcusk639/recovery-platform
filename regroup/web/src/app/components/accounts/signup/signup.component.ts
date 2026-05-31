import { Component, OnInit, Inject, PLATFORM_ID } from "@angular/core";
import { AuthService } from "src/app/services/auth/auth-service.service";
import { FormGroup } from "@angular/forms";
import { User, createSuperAdmin } from "src/app/entities/User";
import { BetaService } from "src/app/services/beta.service";
import { isPlatformBrowser } from "@angular/common";
import { AngularFireAnalytics } from "@angular/fire/analytics";

@Component({
  selector: "app-signup",
  templateUrl: "./signup.component.html",
  styleUrls: ["./signup.component.css"],
})
export class SignupComponent implements OnInit {
  formGroup: FormGroup;
  loading: boolean = false;
  error: string = "";
  signUpStarted: boolean = false;
  billingCompleted: boolean = false;
  user: User;

  constructor(
    private auth: AuthService,
    private betaService: BetaService,
    @Inject(PLATFORM_ID) private platformId: Object,
    private analytics: AngularFireAnalytics,
  ) {}

  setBillingCompleted = (value: boolean) => {
    this.billingCompleted = value;
    if (this.billingCompleted) {
      // go back to the mobile app
    }
  };

  get fromApp() {
    //@ts-ignore
    return isPlatformBrowser(this.platformId) && window.launchedFromMobile;
  }

  get valid() {
    return this.formGroup.valid;
  }

  get isMobile() {
    if (!isPlatformBrowser(this.platformId)) return false;
    const win = window as any;
    return typeof win.isMobile === "function" && win.isMobile();
  }

  setLoading = (value: boolean) => {
    this.loading = value;
  };

  ngOnInit(): void {
    this.formGroup = this.auth.buildAuthForm();
    this.formGroup.get("email").valueChanges.subscribe((value) => {
      this.error = "";
    });
  }

  parseName(fullName: string) {
    const parts = fullName && fullName.split(" ");
    let firstName = "";
    let lastName = "";
    if (parts && parts.length) {
      firstName = parts[0];
      lastName = parts[1] ? parts[1] : "";
    }
    return [firstName, lastName];
  }

  async validateEmail(email: string) {
    const userExists = await this.auth.userWithEmailExists(email);
    if (userExists) {
      this.error = "This email address is already in use.";
      return false;
    }
    return true;
  }

  async onSubmit() {
    this.loading = true;
    const [firstName, lastName] = this.parseName(this.formGroup.value.fullName);
    const user = new User();
    user.firstName = firstName;
    user.lastName = lastName;
    user.password = this.formGroup.get("password").value;
    user.email = this.auth.cachedDetails.email = (
      this.formGroup.value.email as string
    ).toLowerCase();
    try {
      const valid = await this.validateEmail(user.email);
      this.analytics.logEvent("signup-started");
      if (valid) {
        this.user = user;
        this.signUpStarted = true;
      }
    } catch (error) {
      // invalid user
      console.error(error);
    }
    this.loading = false;
  }
}
