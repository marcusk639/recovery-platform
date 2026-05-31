import { async, ComponentFixture, TestBed } from "@angular/core/testing";
import { NO_ERRORS_SCHEMA, PLATFORM_ID } from "@angular/core";

import { ScreenshotOneComponent } from "./screenshot-one.component";

describe("ScreenshotOneComponent", () => {
  let component: ScreenshotOneComponent;
  let fixture: ComponentFixture<ScreenshotOneComponent>;

  beforeEach(async(() => {
    TestBed.configureTestingModule({
      declarations: [ScreenshotOneComponent],
      schemas: [NO_ERRORS_SCHEMA],
      providers: [{ provide: PLATFORM_ID, useValue: "server" }],
    }).compileComponents();
  }));

  beforeEach(() => {
    fixture = TestBed.createComponent(ScreenshotOneComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it("should create", () => {
    expect(component).toBeTruthy();
  });
});
