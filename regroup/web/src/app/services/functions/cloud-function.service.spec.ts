import { TestBed } from "@angular/core/testing";
import { AngularFireFunctions } from "@angular/fire/functions";
import { CloudFunctionService } from "./cloud-function.service";

describe("CloudFunctionService", () => {
  let service: CloudFunctionService;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        {
          provide: AngularFireFunctions,
          useValue: { httpsCallable: () => () => ({}) },
        },
      ],
    });
    service = TestBed.inject(CloudFunctionService);
  });

  it("should be created", () => {
    expect(service).toBeTruthy();
  });
});
