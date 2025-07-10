#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const os = require('os');

console.log('🚀 Setting up Tauri Updater...\n');

// Check if we're in the right directory
if (!fs.existsSync('src-tauri')) {
  console.error('❌ Error: Please run this script from the louaj_desktop_app directory');
  process.exit(1);
}

// Determine the key path based on OS
const isWindows = process.platform === 'win32';
const homeDir = os.homedir();
const keyDir = path.join(homeDir, '.tauri');
const keyPath = path.join(keyDir, 'nqlix_desktop_app.key');
const pubKeyPath = path.join(keyDir, 'nqlix_desktop_app.key.pub');

// Create .tauri directory if it doesn't exist
if (!fs.existsSync(keyDir)) {
  fs.mkdirSync(keyDir, { recursive: true });
}

// Generate updater keys
console.log('📝 Generating updater keys...');
try {
  const generateCommand = `cd src-tauri && cargo tauri signer generate -w "${keyPath}"`;
  execSync(generateCommand, { stdio: 'inherit' });
  console.log('✅ Updater keys generated successfully');
} catch (error) {
  console.error('❌ Failed to generate updater keys:', error.message);
  process.exit(1);
}

// Read the public key from the generated file
console.log('\n🔑 Reading public key...');
try {
  if (!fs.existsSync(pubKeyPath)) {
    throw new Error(`Public key file not found at ${pubKeyPath}`);
  }
  
  const publicKey = fs.readFileSync(pubKeyPath, 'utf8').trim();
  console.log('✅ Public key retrieved');
  
  // Update tauri.conf.json with the public key
  const configPath = path.join('src-tauri', 'tauri.conf.json');
  const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
  
  // Update the updater configuration
  config.tauri.updater.pubkey = publicKey;
  
  // Update the endpoint URL (you'll need to replace YOUR_USERNAME and YOUR_REPO)
  const repoUrl = 'https://github.com/YOUR_USERNAME/YOUR_REPO/releases/latest/download/latest.json';
  config.tauri.updater.endpoints = [repoUrl];
  
  fs.writeFileSync(configPath, JSON.stringify(config, null, 2));
  console.log('✅ Updated tauri.conf.json with public key');
  
  console.log('\n📋 Next steps:');
  console.log('1. Replace "YOUR_USERNAME" and "YOUR_REPO" in src-tauri/tauri.conf.json with your actual GitHub username and repository name');
  console.log('2. Push your changes to GitHub');
  console.log('3. Create a release by pushing a tag: git tag v1.0.0 && git push origin v1.0.0');
  console.log('4. The GitHub Action will automatically build and release your app');
  console.log('\n🔐 Key files location:');
  console.log(`   Private key: ${keyPath}`);
  console.log(`   Public key: ${pubKeyPath}`);
  console.log('\n⚠️  IMPORTANT: Keep your private key secure and never commit it to version control!');
  
} catch (error) {
  console.error('❌ Failed to read public key:', error.message);
  process.exit(1);
}

console.log('\n🎉 Updater setup completed!'); 