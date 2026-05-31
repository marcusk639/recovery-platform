import { async, ComponentFixture, TestBed } from "@angular/core/testing";
import { NO_ERRORS_SCHEMA, PLATFORM_ID } from "@angular/core";
import { RouterTestingModule } from "@angular/router/testing";
import { Location } from "@angular/common";

import { HeaderTwoComponent } from "./header-two.component";
import { AuthService } from "src/app/services/auth/auth-service.service";
import AppService from "src/app/services/app-service/app.service";

describe("HeaderTwoComponent", () => {
  let component: HeaderTwoComponent;
  let fixture: ComponentFixture<HeaderTwoComponent>;

  beforeEach(async(() => {
    TestBed.configureTestingModule({
      imports: [RouterTestingModule],
      declarations: [HeaderTwoComponent],
      schemas: [NO_ERRORS_SCHEMA],
      providers: [
        { provide: AppService, useValue: { route: () => Promise.resolve() } },
        {
          provide: AuthService,
          useValue: { user: null, logout: () => Promise.resolve() },
        },
        { provide: Location, useValue: { back: () => {} } },
        { provide: PLATFORM_ID, useValue: "server" },
      ],
    }).compileComponents();
  }));

  beforeEach(() => {
    fixture = TestBed.createComponent(HeaderTwoComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it("should create", () => {
    expect(component).toBeTruthy();
  });
});
