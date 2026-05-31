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
});
