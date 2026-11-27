import {
  Component,
  OnInit,
  Inject,
  PLATFORM_ID,
  TemplateRef,
  ViewChild,
} from "@angular/core";
import { AuthService } from "src/app/services/auth/auth-service.service";
import { ModalService } from "src/app/services/modal.service";
import {
  FormGroup,
  FormBuilder,
  FormControl,
  Validators,
} from "@angular/forms";
import { User } from "src/app/entities/User";
import { isPlatformBrowser } from "@angular/common";
import { CloudFunctionService } from "src/app/services/functions/cloud-function.service";
import { ActivatedRoute, Router } from "@angular/router";
import { jqueryPlugin } from "src/app/util/jquery";

@Component({
  selector: "app-my-account",
  templateUrl: "./my-account.component.html",
  styleUrls: ["./my-account.component.css"],
})
export class MyAccountComponent implements OnInit {
  loading: boolean = false;
  initializing: boolean = false;
  portalLoading: boolean = false;
  success: boolean = false;
  successMessage: string = "";
  user: User;
  error: boolean = false;
  formGroups: Record<string, FormGroup> = { contact: null };
  modalProps;

  @ViewChild("contact") contact: TemplateRef<any>;

  constructor(
    private userService: AuthService,
    @Inject(PLATFORM_ID) private platformId: Object,
    private modalService: ModalService,
    private formBuilder: FormBuilder,
    private functions: CloudFunctionService,
    protected router: Router,
    private route: ActivatedRoute,
  ) {}

  /** Opened from the mobile app (services/webBilling.ts adds ?from=app). */
  get fromApp(): boolean {
    return this.route.snapshot?.queryParamMap?.get("from") === "app";
  }

  redirectTo(url: string): void {
    window.location.href = url;
  }

  async checkUser() {
    this.initializing = true;
    this.user = this.userService.user;
    if (!this.user) {
      this.user = await this.userService.doAutoLogin();
      if (!this.user) {
        return this.router.navigate(["/login"]);
      }
    }
    this.initializing = false;
  }

  async ngOnInit() {
    await this.checkUser();
    if (this.user) {
      this.modalProps = {
        contact: {
          title: "Contact",
          onConfirm: this.updateUser("contact"),
        },
      };
      this.formGroups.contact = this.buildForm("contact");
    }
  }

  openBillingPortal = async () => {
    if (!isPlatformBrowser(this.platformId)) return;
    this.portalLoading = true;
    this.error = false;
    try {
      // The portal returns here; from=app keeps the "Return to Regroup" link.
      const returnUrl = `${window.location.origin}/my-account${this.fromApp ? "?from=app" : ""}`;
      const { url } =
        await this.functions.createBillingPortalSession(returnUrl);
      this.redirectTo(url);
    } catch {
      this.error = true;
      this.success = false;
      this.portalLoading = false;
      this.scrollUp();
    }
  };

  /** A plan restarted from app-plan-reactivate: keep the page and the cached user current. */
  onReactivated(updated: User): void {
    this.user = { ...this.user, ...updated };
    this.userService.user = this.user;
  }

  get status() {
    return this.user?.subscriptionMetadata?.status;
  }

  scrollUp = () => {
    window.setTimeout(function () {
      window.scrollTo({ top: 0 });
    });
  };

  setError = () => {
    this.loading = false;
    this.error = true;
    this.success = false;
    this.modalService.loading = false;
    this.toggleModal();
    this.scrollUp();
  };

  setSuccess = (message?: string) => {
    this.loading = false;
    this.error = false;
    this.success = true;
    this.successMessage = message || this.successMessage;
    this.modalService.loading = false;
    this.toggleModal();
    this.scrollUp();
  };

  // Fields each account form is allowed to write to the user's own doc.
  // Restricting the write prevents arbitrary/privileged fields (e.g. isAdmin)
  // from being persisted if they ever appear in a form value.
  private static readonly EDITABLE_FIELDS: Record<string, string[]> = {
    contact: ["phoneNumber"],
  };

  updateUser = (formGroup: "contact") => async () => {
    this.setLoading();
    try {
      const formValue = this.formGroups[formGroup]?.value;
      if (formValue) {
        const allowedFields =
          MyAccountComponent.EDITABLE_FIELDS[formGroup] ?? [];
        const update = allowedFields.reduce(
          (acc, field) => {
            if (field in formValue) {
              acc[field] = formValue[field];
            }
            return acc;
          },
          {} as Record<string, any>,
        );
        await this.userService.updateUser(this.user.id, update);
        this.user = this.userService.user;
      }
      this.setSuccess();
    } catch {
      this.setError();
    }
  };

  showModal(templateRefId: string) {
    this.modalService.template = this[templateRefId];
    const assignProp = (prop: string) => this.modalProps[templateRefId]?.[prop];
    this.modalService.title = assignProp("title");
    this.modalService.onConfirm =
      assignProp("onConfirm") ?? this.modalService.onConfirm;
    this.modalService.cancelTxt =
      assignProp("cancelTxt") ?? this.modalService.cancelTxt;
    this.modalService.confirmTxt =
      assignProp("confirmTxt") ?? this.modalService.confirmTxt;
  }

  toggleModal() {
    const $ = jqueryPlugin("modal");
    if ($) $("#modal").modal("toggle");
  }

  setLoading = (value: boolean = true) => {
    this.loading = value;
    this.error = this.success = false;
    this.modalService.loading = value;
  };

  buildForm(form: "contact") {
    return this.formBuilder.group({
      phoneNumber: new FormControl(this.user.phoneNumber, [
        Validators.required,
      ]),
    });
  }
}
