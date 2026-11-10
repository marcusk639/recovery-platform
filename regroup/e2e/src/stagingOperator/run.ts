import { OperatorPlan, parseOperatorArgs } from './plan';
import {
  buildOperatorUserDoc,
  canCreateHouses,
  newOperatorCredentials,
  readStagingConfig,
  StagingConfig,
} from './staging';
import { StagingClient } from './stagingClient';

/** Stripe's test-mode Visa. Staging's Stripe key is a test key, so no money moves. */
export const TEST_PAYMENT_METHOD = 'pm_card_visa';

export interface RunDeps {
  argv: readonly string[];
  configFile: string;
  readFile: (f: string) => string;
  makeClient: (c: StagingConfig) => StagingClient;
  now: () => Date;
  random: (n: number) => Buffer;
}

export interface RunResult {
  email: string;
  password: string;
  uid: string;
  plan: OperatorPlan;
  customerId: string;
  subscriptionId: string;
  status: string;
}

export async function runStagingOperator(deps: RunDeps): Promise<RunResult> {
  const plan = parseOperatorArgs(deps.argv);
  const config = readStagingConfig(deps.configFile, deps.readFile);
  const client = deps.makeClient(config);
  const { email, password } = newOperatorCredentials(deps.now(), deps.random);

  const { uid, idToken } = await client.signUp(email, password);

  // From here on an account exists, so every failure says which one was left behind.
  const step = async <T>(name: string, work: () => Promise<T>): Promise<T> => {
    try {
      return await work();
    } catch (err) {
      throw new Error(
        `${name} failed: ${(err as Error).message}. The account ${email} (uid ${uid}) was created and is left on staging.`,
      );
    }
  };

  const doc = buildOperatorUserDoc(uid, email);
  await step('Writing the users doc', () => client.createUserDoc(idToken, uid, doc));
  await step('createOperatorSubscription', () =>
    client.callFunction(idToken, 'createOperatorSubscription', {
      user: { id: uid, email, subscriptionMetadata: doc.subscriptionMetadata },
      paymentMethod: TEST_PAYMENT_METHOD,
      houseType: plan.houseType,
      tier: plan.tier,
      billingInterval: plan.interval,
    }),
  );
  const saved = await step('Reading the users doc back', () => client.readUserDoc(idToken, uid));

  const meta = (saved.subscriptionMetadata ?? {}) as Record<string, unknown>;
  if (!canCreateHouses(meta)) {
    throw new Error(
      `The subscribed user cannot create houses: tier ${String(meta.tier)}, status ${String(meta.status)}. ` +
        `The account ${email} (uid ${uid}) is left on staging.`,
    );
  }

  return {
    email,
    password,
    uid,
    plan,
    customerId: String(meta.customerId ?? ''),
    subscriptionId: String(meta.subscriptionId ?? ''),
    status: String(meta.status),
  };
}

export function formatRunResult(r: RunResult): string {
  return [
    'Staging operator ready (regroup-e2e, Stripe test mode).',
    '',
    `  Email:         ${r.email}`,
    `  Password:      ${r.password}`,
    `  uid:           ${r.uid}`,
    `  Plan:          ${r.plan.houseType} ${r.plan.tier}, billed every ${r.plan.interval}`,
    `  Subscription:  ${r.subscriptionId} (${r.status}), customer ${r.customerId}`,
    '',
    'Sign in on the E2EStaging build (com.rats.dev.e2e.stg). Sign-in lands on OrgSetup,',
    'where you can create a house.',
    '',
    'Note: each run makes staging email admin@regroup-app.com about a new subscription.',
  ].join('\n');
}
