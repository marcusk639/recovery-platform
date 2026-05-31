import { async, ComponentFixture, TestBed } from "@angular/core/testing";
import { NO_ERRORS_SCHEMA } from "@angular/core";
import { FormGroup, FormControl } from "@angular/forms";

import { ContactPageComponent } from "./contact-page.component";
import { ContactService } from "src/app/services/contact/contact.service";

describe("ContactPageComponent", () => {
  let component: ContactPageComponent;
  let fixture: ComponentFixture<ContactPageComponent>;

  beforeEach(async(() => {
    TestBed.configureTestingModule({
      declarations: [ContactPageComponent],
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
    fixture = TestBed.createComponent(ContactPageComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it("should create", () => {
    expect(component).toBeTruthy();
  });
});
