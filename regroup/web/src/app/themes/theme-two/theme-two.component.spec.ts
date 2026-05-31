import { async, ComponentFixture, TestBed } from "@angular/core/testing";
import { NO_ERRORS_SCHEMA } from "@angular/core";
import { RouterTestingModule } from "@angular/router/testing";

import { ThemeTwoComponent } from "./theme-two.component";

describe("ThemeTwoComponent", () => {
  let component: ThemeTwoComponent;
  let fixture: ComponentFixture<ThemeTwoComponent>;

  beforeEach(async(() => {
    TestBed.configureTestingModule({
      imports: [RouterTestingModule],
      declarations: [ThemeTwoComponent],
      schemas: [NO_ERRORS_SCHEMA],
    }).compileComponents();
  }));

  beforeEach(() => {
    fixture = TestBed.createComponent(ThemeTwoComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it("should create", () => {
    expect(component).toBeTruthy();
  });
});
