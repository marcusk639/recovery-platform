import { TestBed } from "@angular/core/testing";
import { ReactiveFormsModule } from "@angular/forms";
import { AngularFirestore } from "@angular/fire/firestore";
import { AngularFireAuth } from "@angular/fire/auth";
import { CloudFunctionService } from "../functions/cloud-function.service";
import { AuthService } from "./auth-service.service";

describe("AuthServiceService", () => {
  let service: AuthService;

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [ReactiveFormsModule],
      providers: [
        { provide: AngularFirestore, useValue: { collection: () => ({}) } },
        { provide: AngularFireAuth, useValue: {} },
        { provide: CloudFunctionService, useValue: {} },
      ],
    });
    service = TestBed.inject(AuthService);
  });

  it("should be created", () => {
    expect(service).toBeTruthy();
  });
});
