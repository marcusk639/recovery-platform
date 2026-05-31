import { async, ComponentFixture, TestBed } from "@angular/core/testing";
import { NO_ERRORS_SCHEMA, PLATFORM_ID } from "@angular/core";

import { DownloadComponent } from "./download.component";

describe("DownloadComponent", () => {
  let component: DownloadComponent;
  let fixture: ComponentFixture<DownloadComponent>;

  beforeEach(async(() => {
    TestBed.configureTestingModule({
      declarations: [DownloadComponent],
      schemas: [NO_ERRORS_SCHEMA],
      providers: [{ provide: PLATFORM_ID, useValue: "server" }],
    }).compileComponents();
  }));

  beforeEach(() => {
    fixture = TestBed.createComponent(DownloadComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it("should create", () => {
    expect(component).toBeTruthy();
  });
});
