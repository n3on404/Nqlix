# Tauri Updater Setup Guide

This guide will help you set up automatic updates for your Tauri desktop application.

## Prerequisites

1. **GitHub Repository**: Your project must be hosted on GitHub
2. **GitHub Actions**: Enabled for your repository
3. **Rust & Cargo**: Installed on your development machine
4. **Node.js & pnpm**: For building the frontend

## Setup Steps

### 1. Generate Updater Keys

Run the setup script to generate the necessary keys:

```bash
cd louaj_desktop_app
node scripts/setup-updater.js
```

This will:
- Generate signing keys for updates
- Update your `tauri.conf.json` with the public key
- Provide next steps

### 2. Configure GitHub Repository

1. **Update the endpoint URL** in `src-tauri/tauri.conf.json`:
   ```json
   "endpoints": [
     "https://github.com/YOUR_USERNAME/YOUR_REPO/releases/latest/download/latest.json"
   ]
   ```
   Replace `YOUR_USERNAME` and `YOUR_REPO` with your actual GitHub username and repository name.

2. **Push your changes** to GitHub:
   ```bash
   git add .
   git commit -m "Add updater configuration"
   git push origin main
   ```

### 3. Create Your First Release

1. **Update the version** in `src-tauri/Cargo.toml`:
   ```toml
   [package]
   version = "1.0.0"
   ```

2. **Create and push a tag**:
   ```bash
   git tag v1.0.0
   git push origin v1.0.0
   ```

3. **Monitor the GitHub Action**:
   - Go to your repository on GitHub
   - Click on the "Actions" tab
   - Watch the "Release" workflow run

### 4. Test the Update System

1. **Build and run your app** locally:
   ```bash
   cd src-tauri
   cargo tauri dev
   ```

2. **Create a new version**:
   - Update the version in `Cargo.toml` to `1.0.1`
   - Create a new tag: `git tag v1.0.1 && git push origin v1.0.1`

3. **Test the update** in your running app

## How It Works

### Update Flow

1. **Check for Updates**: The app checks for updates when it starts
2. **Download**: If an update is available, it downloads the new version
3. **Install**: The app installs the update and restarts

### GitHub Actions Workflow

The `.github/workflows/release.yml` file:
- Triggers on version tags (e.g., `v1.0.0`)
- Builds the app for Windows (and other platforms)
- Creates a GitHub release with the built files
- Generates update metadata

### Update Components

- **UpdateManager.tsx**: React component for update UI
- **main.rs**: Rust event handlers for update events
- **tauri.conf.json**: Updater configuration

## Configuration Options

### Updater Settings in `tauri.conf.json`

```json
"updater": {
  "active": true,
  "endpoints": [
    "https://github.com/YOUR_USERNAME/YOUR_REPO/releases/latest/download/latest.json"
  ],
  "dialog": true,
  "pubkey": "YOUR_PUBLIC_KEY"
}
```

- `active`: Enable/disable the updater
- `endpoints`: Array of update server URLs
- `dialog`: Show update dialog (true/false)
- `pubkey`: Public key for verifying updates

### Windows Startup Configuration

To make your app start on Windows boot:

1. **Create a shortcut** to your app
2. **Press Win+R** and type `shell:startup`
3. **Copy the shortcut** to the startup folder

Or use the Windows Registry:
```reg
Windows Registry Editor Version 5.00

[HKEY_CURRENT_USER\Software\Microsoft\Windows\CurrentVersion\Run]
"Nqlix"="C:\\Path\\To\\Your\\App.exe"
```

## Troubleshooting

### Common Issues

1. **"Failed to get public key"**
   - Make sure you have Rust and Cargo installed
   - Run `cargo install tauri-cli` first

2. **"Update not found"**
   - Check that your GitHub repository name is correct
   - Ensure the release was created successfully
   - Verify the `latest.json` file exists in the release

3. **"Signature verification failed"**
   - Regenerate the keys using the setup script
   - Update the public key in `tauri.conf.json`

4. **"Download failed"**
   - Check your internet connection
   - Verify the release files are accessible
   - Check Windows firewall settings

### Debug Information

Enable debug logging by adding to `main.rs`:
```rust
app_handle.listen_global("tauri://update-available", move |event| {
    println!("Update available: {:?}", event.payload());
});
```

## Security Notes

- **Keep your private key secure**: Never commit `~/.tauri/nqlix_desktop_app.key` to version control
- **Verify releases**: Always verify the signature of downloaded updates
- **HTTPS only**: Use HTTPS endpoints for update servers

## Next Steps

1. **Customize the update UI** in `UpdateManager.tsx`
2. **Add update notifications** to your app
3. **Configure automatic update checks** on app startup
4. **Set up CI/CD** for automated releases

## Support

For more information, see the [Tauri Updater documentation](https://v2.tauri.app/plugin/updater/). 