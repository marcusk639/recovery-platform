// Creates a new test house with three residents in the manual-testing emulators
// (scripts/test-prep.sh), for signing in on the simulator. Every run makes a new house.
//
//   E2E_TEST_PASSWORD=... npm run e2e:new-house
import { newHouseWithGuests } from '../src/journeys/newHouseWithGuests';

async function main(): Promise<void> {
  const password = process.env.E2E_TEST_PASSWORD;
  if (!password) throw new Error('Set E2E_TEST_PASSWORD: the accounts are created with it.');

  const made = await newHouseWithGuests({ password, suffix: Date.now().toString(36).slice(-5) });
  console.log(`House: ${made.house.name} (${made.house.id})`);
  console.log(`Operator: ${made.operator.email}`);
  for (const resident of made.residents) {
    console.log(`Resident: ${resident.firstName} ${resident.lastName}: ${resident.email}`);
  }
  console.log('Sign in with E2E_TEST_PASSWORD.');
}

main().then(
  () => process.exit(0),
  (err: Error) => {
    console.error(err.message);
    process.exit(1);
  },
);
