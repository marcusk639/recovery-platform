#!/usr/bin/env npx ts-node
/**
 * Script to identify which Stripe account(s) your API keys belong to.
 * 
 * Usage:
 *   cd functions
 *   npx ts-node scripts/checkStripeAccount.ts
 * 
 * Or with specific key:
 *   STRIPE_KEY=sk_test_xxx npx ts-node scripts/checkStripeAccount.ts
 */

import * as dotenv from 'dotenv';
import * as path from 'path';
import Stripe from 'stripe';

// Load .env from functions directory
dotenv.config({ path: path.resolve(__dirname, '../.env') });

interface KeyConfig {
  name: string;
  envVar: string;
  key: string | undefined;
}

// Define all possible Stripe key environment variables
const keyConfigs: KeyConfig[] = [
  {
    name: 'Test Secret Key',
    envVar: 'STRIPE_TEST_SECRET_KEY',
    key: process.env.STRIPE_TEST_SECRET_KEY,
  },
  {
    name: 'Live Secret Key',
    envVar: 'STRIPE_SECRET_KEY',
    key: process.env.STRIPE_SECRET_KEY,
  },
  {
    name: 'Test Webhook Secret',
    envVar: 'STRIPE_TEST_WEBHOOK_SECRET',
    key: process.env.STRIPE_TEST_WEBHOOK_SECRET,
  },
  {
    name: 'Live Webhook Secret',
    envVar: 'STRIPE_WEBHOOK_SECRET',
    key: process.env.STRIPE_WEBHOOK_SECRET,
  },
];

// Additional keys from environment
const additionalKeys: KeyConfig[] = [
  {
    name: 'Test Price ID (Member)',
    envVar: 'STRIPE_TEST_PRICE_ID_MEMBER',
    key: process.env.STRIPE_TEST_PRICE_ID_MEMBER,
  },
  {
    name: 'Live Price ID (Member)',
    envVar: 'STRIPE_PRICE_ID_MEMBER',
    key: process.env.STRIPE_PRICE_ID_MEMBER,
  },
];

async function checkStripeAccount(secretKey: string, keyName: string): Promise<void> {
  try {
    const stripe = new Stripe(secretKey, {
      apiVersion: '2025-03-31.basil',
    });

    const account = await stripe.accounts.retrieve();
    
    console.log(`\n${'='.repeat(60)}`);
    console.log(`✅ ${keyName}`);
    console.log(`${'='.repeat(60)}`);
    console.log(`  Account ID:      ${account.id}`);
    console.log(`  Business Name:   ${account.business_profile?.name || 'Not set'}`);
    console.log(`  Email:           ${account.email || 'Not set'}`);
    console.log(`  Country:         ${account.country}`);
    console.log(`  Default Currency: ${account.default_currency?.toUpperCase() || 'Not set'}`);
    console.log(`  Charges Enabled: ${account.charges_enabled ? 'Yes' : 'No'}`);
    console.log(`  Payouts Enabled: ${account.payouts_enabled ? 'Yes' : 'No'}`);
    console.log(`  Type:            ${account.type || 'Standard'}`);
    
    if (account.business_profile?.url) {
      console.log(`  Website:         ${account.business_profile.url}`);
    }
    
    // Show key prefix info
    const keyPrefix = secretKey.substring(0, 12);
    const isTestMode = secretKey.startsWith('sk_test_');
    console.log(`  Mode:            ${isTestMode ? '🧪 TEST' : '🔴 LIVE'}`);
    console.log(`  Key Prefix:      ${keyPrefix}...`);

  } catch (error: any) {
    console.log(`\n${'='.repeat(60)}`);
    console.log(`❌ ${keyName}`);
    console.log(`${'='.repeat(60)}`);
    console.log(`  Error: ${error.message}`);
    
    if (error.type === 'StripeAuthenticationError') {
      console.log(`  → The API key is invalid or has been revoked.`);
    }
  }
}

async function main(): Promise<void> {
  console.log('\n🔍 Stripe Account Checker');
  console.log('========================\n');
  
  // Check for command-line provided key
  const cliKey = process.env.STRIPE_KEY;
  if (cliKey) {
    console.log('Using key provided via STRIPE_KEY environment variable...');
    await checkStripeAccount(cliKey, 'CLI Provided Key');
    return;
  }

  // Show all found environment variables
  console.log('📋 Environment Variables Found:');
  console.log('-'.repeat(40));
  
  let foundSecretKeys = 0;
  
  for (const config of keyConfigs) {
    const status = config.key ? '✅' : '❌';
    const value = config.key 
      ? `${config.key.substring(0, 12)}...${config.key.slice(-4)}`
      : 'Not set';
    console.log(`  ${status} ${config.envVar}: ${value}`);
    
    if (config.key && (config.envVar.includes('SECRET_KEY') && !config.envVar.includes('WEBHOOK'))) {
      foundSecretKeys++;
    }
  }
  
  console.log('\n📋 Additional Config Values:');
  console.log('-'.repeat(40));
  
  for (const config of additionalKeys) {
    const status = config.key ? '✅' : '❌';
    const value = config.key || 'Not set';
    console.log(`  ${status} ${config.envVar}: ${value}`);
  }

  if (foundSecretKeys === 0) {
    console.log('\n⚠️  No secret keys found in environment!');
    console.log('   Make sure your .env file exists in the functions directory.');
    console.log('   Expected path: functions/.env');
    console.log('\n   You can also run with a specific key:');
    console.log('   STRIPE_KEY=sk_test_xxx npx ts-node scripts/checkStripeAccount.ts');
    return;
  }

  // Check each secret key
  console.log('\n🔐 Checking Stripe Account(s)...');
  
  for (const config of keyConfigs) {
    // Only check secret keys (not webhook secrets)
    if (config.key && config.envVar.includes('SECRET_KEY') && !config.envVar.includes('WEBHOOK')) {
      await checkStripeAccount(config.key, config.name);
    }
  }

  // Show webhook secret info (can't retrieve account with webhook secrets)
  const webhookConfigs = keyConfigs.filter(
    c => c.key && c.envVar.includes('WEBHOOK')
  );
  
  if (webhookConfigs.length > 0) {
    console.log(`\n${'='.repeat(60)}`);
    console.log('📡 Webhook Secrets (Cannot retrieve account info)');
    console.log(`${'='.repeat(60)}`);
    
    for (const config of webhookConfigs) {
      console.log(`  ${config.name}: ${config.key?.substring(0, 10)}...`);
    }
  }

  console.log('\n✨ Done!\n');
}

main().catch(console.error);

