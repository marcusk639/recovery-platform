import { async, ComponentFixture, TestBed } from "@angular/core/testing";
import { NO_ERRORS_SCHEMA } from "@angular/core";
import { ReactiveFormsModule, FormGroup, FormControl } from "@angular/forms";

import { MekFieldComponent } from "./mek-field.component";

describe("MekFieldComponent", () => {
  let component: MekFieldComponent;
  let fixture: ComponentFixture<MekFieldComponent>;

  beforeEach(async(() => {
    TestBed.configureTestingModule({
      imports: [ReactiveFormsModule],
      declarations: [MekFieldComponent],
      schemas: [NO_ERRORS_SCHEMA],
    }).compileComponents();
  }));

  beforeEach(() => {
    fixture = TestBed.createComponent(MekFieldComponent);
    component = fixture.componentInstance;
    component.formGroup = new FormGroup({ email: new FormControl("") });
    component.formControlName = "email";
    fixture.detectChanges();
  });

  it("should create", () => {
    expect(component).toBeTruthy();
  });
});
