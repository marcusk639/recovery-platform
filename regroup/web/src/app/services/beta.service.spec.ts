import { TestBed } from "@angular/core/testing";
import { AngularFirestore } from "@angular/fire/firestore";
import { BetaService } from "./beta.service";

describe("BetaService", () => {
  let service: BetaService;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        { provide: AngularFirestore, useValue: { collection: () => ({}) } },
      ],
    });
    service = TestBed.inject(BetaService);
  });

  it("should be created", () => {
    expect(service).toBeTruthy();
  });
});
