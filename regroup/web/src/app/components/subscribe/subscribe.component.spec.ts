import { async, ComponentFixture, TestBed } from "@angular/core/testing";
import { NO_ERRORS_SCHEMA } from "@angular/core";
import { FormGroup, FormControl } from "@angular/forms";

import { SubscribeComponent } from "./subscribe.component";
import { SubscriptionService } from "src/app/services/subscriptions/subscription.service";

describe("SubscribeComponent", () => {
  let component: SubscribeComponent;
  let fixture: ComponentFixture<SubscribeComponent>;

  beforeEach(async(() => {
    TestBed.configureTestingModule({
      declarations: [SubscribeComponent],
      schemas: [NO_ERRORS_SCHEMA],
      providers: [
        {
          provide: SubscriptionService,
          useValue: {
            buildForm: () => new FormGroup({ email: new FormControl("") }),
            pushEmail: () => Promise.resolve(),
            housePrice: 0,
            residentPrice: 0,
          },
        },
      ],
    }).compileComponents();
  }));

  beforeEach(() => {
    fixture = TestBed.createComponent(SubscribeComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it("should create", () => {
    expect(component).toBeTruthy();
  });
});
