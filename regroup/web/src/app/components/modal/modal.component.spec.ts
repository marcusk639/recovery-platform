import { async, ComponentFixture, TestBed } from "@angular/core/testing";
import { NO_ERRORS_SCHEMA } from "@angular/core";

import { ModalComponent } from "./modal.component";
import { ModalService } from "src/app/services/modal.service";

describe("ModalComponent", () => {
  let component: ModalComponent;
  let fixture: ComponentFixture<ModalComponent>;

  beforeEach(async(() => {
    TestBed.configureTestingModule({
      declarations: [ModalComponent],
      schemas: [NO_ERRORS_SCHEMA],
      providers: [
        {
          provide: ModalService,
          useValue: {
            template: null,
            loading: false,
            title: "",
            confirmTxt: "Save",
            cancelTxt: "Cancel",
            disableConfirm: false,
            onConfirm: () => {},
            onCancel: () => {},
          },
        },
      ],
    }).compileComponents();
  }));

  beforeEach(() => {
    fixture = TestBed.createComponent(ModalComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it("should create", () => {
    expect(component).toBeTruthy();
  });
});
