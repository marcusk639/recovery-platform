import { TestBed } from "@angular/core/testing";
import { RouterTestingModule } from "@angular/router/testing";
import { AuthGuard } from "./auth.guard";
import { AuthService } from "../services/auth/auth-service.service";

describe("AuthGuard", () => {
  let guard: AuthGuard;

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [RouterTestingModule],
      providers: [
        {
          provide: AuthService,
          useValue: { user: null, doAutoLogin: () => Promise.resolve(null) },
        },
      ],
    });
    guard = TestBed.inject(AuthGuard);
  });

  it("should be created", () => {
    expect(guard).toBeTruthy();
  });
});
