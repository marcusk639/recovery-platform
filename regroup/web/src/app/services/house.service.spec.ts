import { TestBed } from "@angular/core/testing";
import { AngularFirestore } from "@angular/fire/firestore";
import { HouseService } from "./house.service";

describe("HouseService", () => {
  let service: HouseService;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        { provide: AngularFirestore, useValue: { collection: () => ({}) } },
      ],
    });
    service = TestBed.inject(HouseService);
  });

  it("should be created", () => {
    expect(service).toBeTruthy();
  });
});
