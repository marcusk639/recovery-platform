import { async, ComponentFixture, TestBed } from "@angular/core/testing";
import { NO_ERRORS_SCHEMA } from "@angular/core";
import { FormGroup, FormControl } from "@angular/forms";
import { RouterTestingModule } from "@angular/router/testing";
import { ActivatedRoute, Router, convertToParamMap } from "@angular/router";
import { LoginComponent } from "./login.component";
import { AuthService } from "src/app/services/auth/auth-service.service";

describe("LoginComponent", () => {
  let component: LoginComponent;
  let fixture: ComponentFixture<LoginComponent>;

  beforeEach(async(() => {
    TestBed.configureTestingModule({
      imports: [RouterTestingModule],
      declarations: [LoginComponent],
      schemas: [NO_ERRORS_SCHEMA],
      providers: [
        {
          provide: AuthService,
          useValue: {
            buildAuthForm: () =>
              new FormGroup({
                email: new FormControl(""),
                password: new FormControl(""),
              }),
          },
        },
      ],
    }).compileComponents();
  }));

  beforeEach(() => {
    fixture = TestBed.createComponent(LoginComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it("should create", () => {
    expect(component).toBeTruthy();
  });

  // Launch P5 Task 11: from=app survives sign-in, so my-account can hand back.
  describe("after sign-in", () => {
    const signIn = async (from: string | null) => {
      (TestBed.inject(ActivatedRoute) as any).snapshot = {
        queryParamMap: convertToParamMap(from ? { from } : {}),
      };
      (TestBed.inject(AuthService) as any).login = () => Promise.resolve();
      const navigate = spyOn(TestBed.inject(Router), "navigate").and.resolveTo(true);
      await component.onSubmit();
      return navigate;
    };

    it("keeps from=app on the way to my-account", async () => {
      const navigate = await signIn("app");
      expect(navigate).toHaveBeenCalledWith(["my-account"], { queryParams: { from: "app" } });
    });

    it("goes to my-account with no query otherwise", async () => {
      const navigate = await signIn(null);
      expect(navigate).toHaveBeenCalledWith(["my-account"]);
    });
  });
});
