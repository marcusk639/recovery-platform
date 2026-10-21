import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import {
  assertSafeEnvFileName,
  functionsEnvFor,
  loadLaunchConfig,
  writeFunctionsEnvFiles,
} from "../launchConfig";

function writeTempConfig(config: unknown): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "launch-config-"));
  const file = path.join(dir, "launch-config.json");
  fs.writeFileSync(file, JSON.stringify(config));
  return file;
}

const valid = {
  shared: { TIER_BILLING_ENABLED: "true" },
  perEnv: {
    production: { A: "1", B: "2" },
    "e2e-emulator": { A: "1", B: "2" },
    "e2e-staging": { A: "1", B: "2" },
  },
};

describe("functionsEnvFor", () => {
  it("enables tier billing for the emulator", () => {
    expect(functionsEnvFor("e2e-emulator").TIER_BILLING_ENABLED).toBe("true");
  });
  it("uses the v1 connect accounts API", () => {
    expect(functionsEnvFor("e2e-emulator").CONNECT_ACCOUNTS_API).toBe("v1");
  });
  it("uses the production connect base url", () => {
    expect(functionsEnvFor("production").CONNECT_BASE_URL).toBe(
      "https://regroup-app.com/connect",
    );
  });
  it("includes the staging origin as a comma-joined string", () => {
    const origins = functionsEnvFor("e2e-staging").ALLOWED_RETURN_ORIGINS;
    expect(typeof origins).toBe("string");
    expect(origins.split(",")).toContain("https://regroup-e2e.web.app");
  });
});

describe("loadLaunchConfig", () => {
  it("loads the committed config and derives paywallEnabled", () => {
    expect(loadLaunchConfig().paywallEnabled).toBe(true);
  });
  it("throws when an env is missing a key another env defines", () => {
    const bad = {
      ...valid,
      perEnv: { ...valid.perEnv, "e2e-staging": { A: "1" } },
    };
    expect(() => loadLaunchConfig(writeTempConfig(bad))).toThrow(/B/);
  });
  it.each(["sk_live_x", "rk_test_x", "whsec_x"])(
    "throws when a value contains %s",
    (secret) => {
      const bad = { ...valid, shared: { TIER_BILLING_ENABLED: secret } };
      expect(() => loadLaunchConfig(writeTempConfig(bad))).toThrow(/secret/i);
    },
  );
});

describe("writeFunctionsEnvFiles", () => {
  it("writes exactly the two e2e files that round-trip", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "gen-env-"));
    const written = writeFunctionsEnvFiles(dir);
    expect(fs.readdirSync(dir).sort()).toEqual([
      ".env.demo-regroup-e2e",
      ".env.regroup-e2e",
    ]);
    expect(written.map((p) => path.basename(p)).sort()).toEqual(
      fs.readdirSync(dir).sort(),
    );
    const parse = (file: string) =>
      Object.fromEntries(
        fs
          .readFileSync(path.join(dir, file), "utf8")
          .split("\n")
          .filter((l) => l && !l.startsWith("#"))
          .map((l) => [l.slice(0, l.indexOf("=")), l.slice(l.indexOf("=") + 1)]),
      );
    expect(parse(".env.demo-regroup-e2e")).toEqual(functionsEnvFor("e2e-emulator"));
    expect(parse(".env.regroup-e2e")).toEqual(functionsEnvFor("e2e-staging"));
  });
  it("starts files with a generated-file header", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "gen-env-"));
    writeFunctionsEnvFiles(dir);
    expect(
      fs.readFileSync(path.join(dir, ".env.regroup-e2e"), "utf8"),
    ).toMatch(/^# GENERATED/);
  });
});

describe("assertSafeEnvFileName", () => {
  it.each([".env", ".env.phoenix-cleanhouse"])("refuses %s", (name) => {
    expect(() => assertSafeEnvFileName(name)).toThrow(/refus/i);
  });
  it("accepts the e2e names", () => {
    expect(() => assertSafeEnvFileName(".env.regroup-e2e")).not.toThrow();
  });
});
