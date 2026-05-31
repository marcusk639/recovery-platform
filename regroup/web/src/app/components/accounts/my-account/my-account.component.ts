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
import { Router } from "@angular/router";

declare var $: any;

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
  ) {}

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
      const returnUrl = window.location.href;
      const { url } =
        await this.functions.createBillingPortalSession(returnUrl);
      window.location.href = url;
    } catch {
      this.error = true;
      this.success = false;
      this.portalLoading = false;
      this.scrollUp();
    }
  };

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

  updateUser = (formGroup: "contact") => async () => {
    this.setLoading();
    try {
      if (this.formGroups[formGroup]?.value) {
        await this.userService.updateUser(
          this.user.id,
          this.formGroups[formGroup].value,
        );
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
    $("#modal").modal("toggle");
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
