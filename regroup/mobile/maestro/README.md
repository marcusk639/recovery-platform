
## Credentials

Flows read the shared test password from `E2E_TEST_PASSWORD`; it is never committed. Export it before running, e.g. `export E2E_TEST_PASSWORD="$(cat ~/.config/regroup-e2e/e2e-test-password)"`, and pass `-e E2E_TEST_PASSWORD="$E2E_TEST_PASSWORD"` to `maestro test`.
