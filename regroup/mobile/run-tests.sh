#!/bin/bash
set -e
cd /Users/marcusklein/dev/rats-v2
node_modules/.bin/jest src/screens/HouseSettings/__tests__/PaymentDashboard.test.tsx --no-coverage --forceExit --watchAll=false 2>&1
echo "EXIT_STATUS:$?"
