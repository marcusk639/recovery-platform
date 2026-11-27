import {
  async,
  fakeAsync,
  tick,
  ComponentFixture,
  TestBed,
} from "@angular/core/testing";
import { NO_ERRORS_SCHEMA } from "@angular/core";
import { ReactiveFormsModule } from "@angular/forms";
import { RouterTestingModule } from "@angular/router/testing";
import { ActivatedRoute, convertToParamMap } from "@angular/router";
import { MyAccountComponent } from "./my-account.component";
import { AuthService } from "src/app/services/auth/auth-service.service";
import { ModalService } from "src/app/services/modal.service";
import { CloudFunctionService } from "src/app/services/functions/cloud-function.service";

describe("MyAccountComponent", () => {
  let component: MyAccountComponent;
  let fixture: ComponentFixture<MyAccountComponent>;

  beforeEach(async(() => {
    TestBed.configureTestingModule({
      imports: [ReactiveFormsModule, RouterTestingModule],
      declarations: [MyAccountComponent],
      schemas: [NO_ERRORS_SCHEMA],
      providers: [
        {
          provide: AuthService,
          useValue: {
            user: { id: "test-user" },
            doAutoLogin: () => Promise.resolve(null),
            updateUser: () => Promise.resolve(),
          },
        },
        { provide: ModalService, useValue: { loading: false } },
        {
          provide: CloudFunctionService,
          useValue: {
            getPaymentMethod: () => Promise.resolve(null),
            createBillingPortalSession: () => Promise.resolve({ url: "" }),
          },
        },
      ],
    }).compileComponents();
  }));

  beforeEach(fakeAsync(() => {
    fixture = TestBed.createComponent(MyAccountComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
    tick(1000);
  }));

  it("should create", () => {
    expect(component).toBeTruthy();
  });

  // Launch P5 Task 11: opened from the app, my-account hands back after the portal.
  describe("hand-back to the app", () => {
    const setFrom = (from: string | null) =>
      ((TestBed.inject(ActivatedRoute) as any).snapshot = {
        queryParamMap: convertToParamMap(from ? { from } : {}),
      });

    it("with from=app, the portal returns to my-account?from=app", async () => {
      setFrom("app");
      const functions = TestBed.inject(CloudFunctionService) as any;
      const create = spyOn(functions, "createBillingPortalSession").and.resolveTo({ url: "https://billing.stripe.com/x" });
      const redirect = spyOn(component, "redirectTo");
      await component.openBillingPortal();
      expect(create.calls.mostRecent().args[0]).toMatch(/\/my-account\?from=app$/);
      expect(redirect).toHaveBeenCalledWith("https://billing.stripe.com/x");
    });

    it("without from=app, the portal returns to my-account with no query", async () => {
      setFrom(null);
      const functions = TestBed.inject(CloudFunctionService) as any;
      const create = spyOn(functions, "createBillingPortalSession").and.resolveTo({ url: "https://billing.stripe.com/x" });
      spyOn(component, "redirectTo");
      await component.openBillingPortal();
      expect(create.calls.mostRecent().args[0]).toMatch(/\/my-account$/);
    });

    it("shows Return to Regroup, linking to /checkout-return?result=portal, only with from=app", () => {
      setFrom("app");
      fixture.detectChanges();
      const link = (fixture.nativeElement as HTMLElement).querySelector<HTMLAnchorElement>("a.return-to-app");
      expect(link?.getAttribute("href")).toBe("/checkout-return?result=portal");
      setFrom(null);
      fixture.detectChanges();
      expect((fixture.nativeElement as HTMLElement).querySelector("a.return-to-app")).toBeNull();
    });
  });
});
