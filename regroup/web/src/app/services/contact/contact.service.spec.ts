import { TestBed } from "@angular/core/testing";
import { ReactiveFormsModule } from "@angular/forms";
import { AngularFirestore } from "@angular/fire/firestore";
import { ContactService } from "./contact.service";

describe("ContactService", () => {
  let service: ContactService;

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [ReactiveFormsModule],
      providers: [
        { provide: AngularFirestore, useValue: { collection: () => ({}) } },
      ],
    });
    service = TestBed.inject(ContactService);
  });

  it("should be created", () => {
    expect(service).toBeTruthy();
  });
});
