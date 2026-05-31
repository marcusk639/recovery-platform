import { async, ComponentFixture, TestBed } from "@angular/core/testing";
import { NO_ERRORS_SCHEMA } from "@angular/core";
import { FormGroup, FormControl } from "@angular/forms";

import { ContactComponent } from "./contact.component";
import { ContactService } from "src/app/services/contact/contact.service";

describe("ContactComponent", () => {
  let component: ContactComponent;
  let fixture: ComponentFixture<ContactComponent>;

  beforeEach(async(() => {
    TestBed.configureTestingModule({
      declarations: [ContactComponent],
      schemas: [NO_ERRORS_SCHEMA],
      providers: [
        {
          provide: ContactService,
          useValue: {
            buildForm: () =>
              new FormGroup({
                name: new FormControl(""),
                email: new FormControl(""),
                message: new FormControl(""),
                subject: new FormControl(""),
              }),
            create: () => Promise.resolve(),
          },
        },
      ],
    }).compileComponents();
  }));

  beforeEach(() => {
    fixture = TestBed.createComponent(ContactComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it("should create", () => {
    expect(component).toBeTruthy();
  });
});
