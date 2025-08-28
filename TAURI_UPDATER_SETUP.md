# Tauri Updater Setup Guide

## Overview

This guide explains how the automatic update system works for the Nqlix desktop application using Tauri 1.5.

## How It Works

### 1. Version Management
- The version is managed in `src-tauri/Cargo.toml` and `src-tauri/tauri.conf.json`
- When you want to release an update, increment the version number in both files
- The version format should follow semantic versioning (e.g., `0.0.3`, `0.0.4`, `1.0.0`)

### 2. GitHub Actions Workflow
- Located at `.github/workflows/release.yml`
- Triggers automatically when you push a tag starting with "v" (e.g., `v0.0.4`)
- Builds the application for Windows (MSI and NSIS installers)
- Creates a GitHub release with the built artifacts

### 3. Updater Configuration
- The updater endpoint is configured in `src-tauri/tauri.conf.json`
- Uses GitHub's API: `https://api.github.com/repos/Samer-Gassouma/Nqlix/releases/latest`
- Automatically checks for new releases and notifies users

## Release Process

### Step 1: Update Version
```bash
# Update version in Cargo.toml
# Update version in tauri.conf.json
```

### Step 2: Commit and Tag
```bash
git add .
git commit -m "Release version 0.0.4"
git tag v0.0.4
git push origin main
git push origin v0.0.4
```

### Step 3: Automatic Build
- GitHub Actions automatically builds the application
- Creates installers for Windows (MSI and NSIS)
- Generates updater files (`.json` and `.sig`)
- Creates a GitHub release with all artifacts

### Step 4: User Updates
- Users with the application installed will automatically receive update notifications
- Updates are downloaded and installed automatically
- No manual intervention required from users

## Configuration Files

### tauri.conf.json
```json
"updater": {
  "active": true,
  "dialog": true,
  "endpoints": [
    "https://api.github.com/repos/Samer-Gassouma/Nqlix/releases/latest"
  ],
  "pubkey": "your-public-key-here",
  "windows": {
    "installMode": "passive"
  }
}
```

### Cargo.toml
```toml
[package]
name = "nqlix_desktop_app"
version = "0.0.3"  # Update this for each release
```

## Troubleshooting

### Common Issues

1. **Updates not showing**: Check if the version in Cargo.toml is higher than the current installed version
2. **Build failures**: Ensure all dependencies are properly installed and the signing key is configured
3. **Updater errors**: Verify the GitHub repository URL and permissions

### Debugging

- Check GitHub Actions logs for build errors
- Verify the release was created successfully on GitHub
- Ensure updater files (`.json` and `.sig`) are included in the release

## Security

- The updater uses code signing to verify update authenticity
- Updates are downloaded over HTTPS from GitHub
- The public key in the configuration verifies update signatures

## Next Steps

1. Test the release process with a minor version bump
2. Verify that users receive update notifications
3. Monitor GitHub Actions for successful builds
4. Consider setting up automated testing before releases 