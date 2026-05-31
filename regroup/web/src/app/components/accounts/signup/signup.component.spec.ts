import { async, ComponentFixture, TestBed } from "@angular/core/testing";
import { NO_ERRORS_SCHEMA } from "@angular/core";
import { FormGroup, FormControl } from "@angular/forms";
import { SignupComponent } from "./signup.component";
import { AuthService } from "src/app/services/auth/auth-service.service";
import { BetaService } from "src/app/services/beta.service";
import { AngularFireAnalytics } from "@angular/fire/analytics";

describe("SignupComponent", () => {
  let component: SignupComponent;
  let fixture: ComponentFixture<SignupComponent>;

  beforeEach(async(() => {
    TestBed.configureTestingModule({
      declarations: [SignupComponent],
      schemas: [NO_ERRORS_SCHEMA],
      providers: [
        {
          provide: AuthService,
          useValue: {
            buildAuthForm: () =>
              new FormGroup({
                fullName: new FormControl(""),
                email: new FormControl(""),
                password: new FormControl(""),
              }),
          },
        },
        { provide: BetaService, useValue: {} },
        {
          provide: AngularFireAnalytics,
          useValue: { logEvent: () => Promise.resolve() },
        },
      ],
    }).compileComponents();
  }));

  beforeEach(() => {
    fixture = TestBed.createComponent(SignupComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it("should create", () => {
    expect(component).toBeTruthy();
  });
});
