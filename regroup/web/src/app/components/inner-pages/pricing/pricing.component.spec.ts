import { async, ComponentFixture, TestBed } from "@angular/core/testing";
import { NO_ERRORS_SCHEMA } from "@angular/core";
import { RouterTestingModule } from "@angular/router/testing";
import { AngularFireAnalytics } from "@angular/fire/analytics";

import { PricingComponent } from "./pricing.component";

describe("PricingComponent", () => {
  let component: PricingComponent;
  let fixture: ComponentFixture<PricingComponent>;

  beforeEach(async(() => {
    TestBed.configureTestingModule({
      imports: [RouterTestingModule],
      declarations: [PricingComponent],
      schemas: [NO_ERRORS_SCHEMA],
      providers: [
        {
          provide: AngularFireAnalytics,
          useValue: { logEvent: () => Promise.resolve() },
        },
      ],
    }).compileComponents();
  }));

  beforeEach(() => {
    fixture = TestBed.createComponent(PricingComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it("should create", () => {
    expect(component).toBeTruthy();
  });
});
