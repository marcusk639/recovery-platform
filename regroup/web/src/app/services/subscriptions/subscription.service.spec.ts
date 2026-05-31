import { TestBed } from "@angular/core/testing";
import { ReactiveFormsModule } from "@angular/forms";
import { AngularFirestore } from "@angular/fire/firestore";
import { SubscriptionService } from "./subscription.service";

describe("SubscriptionService", () => {
  let service: SubscriptionService;

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [ReactiveFormsModule],
      providers: [
        { provide: AngularFirestore, useValue: { collection: () => ({}) } },
      ],
    });
    service = TestBed.inject(SubscriptionService);
  });

  it("should be created", () => {
    expect(service).toBeTruthy();
  });
});
