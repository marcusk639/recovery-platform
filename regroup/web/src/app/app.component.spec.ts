import { async, TestBed } from "@angular/core/testing";
import { RouterTestingModule } from "@angular/router/testing";
import { NO_ERRORS_SCHEMA } from "@angular/core";
import { AppComponent } from "./app.component";
import { AuthService } from "./services/auth/auth-service.service";
import { AngularFireAnalytics } from "@angular/fire/analytics";

describe("AppComponent", () => {
  beforeEach(async(() => {
    TestBed.configureTestingModule({
      imports: [RouterTestingModule],
      declarations: [AppComponent],
      schemas: [NO_ERRORS_SCHEMA],
      providers: [
        {
          provide: AuthService,
          useValue: { doAutoLogin: () => Promise.resolve() },
        },
        {
          provide: AngularFireAnalytics,
          useValue: { logEvent: () => Promise.resolve() },
        },
      ],
    }).compileComponents();
  }));

  it("should create the app", () => {
    const fixture = TestBed.createComponent(AppComponent);
    const app = fixture.componentInstance;
    expect(app).toBeTruthy();
  });

  it("should have the correct title", () => {
    const fixture = TestBed.createComponent(AppComponent);
    const app = fixture.componentInstance;
    expect(app.title).toEqual("sober-living-app");
  });
});
