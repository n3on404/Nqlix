# Update System Documentation

## Overview

The Nqlix desktop app includes an automatic update system that allows users to receive and install updates seamlessly. The system is built using Tauri's built-in updater functionality with custom UI components.

## Features

### Automatic Update Detection
- Updates are automatically checked when the app starts
- Users are notified when updates are available
- Update progress is shown with a progress bar and percentage

### Manual Update Checking
- Users can manually check for updates from the Settings page
- Dedicated update page (`/update`) for detailed update information

### Update Installation
- One-click update installation
- Automatic app restart after update installation
- Error handling and retry functionality

## Components

### 1. UpdateManager Component
Located at `src/components/UpdateManager.tsx`

**Features:**
- Global dialog that appears when updates are available
- Progress tracking during download
- Error handling and retry functionality
- Auto-check for updates on component mount

**Usage:**
```tsx
import { UpdateManager } from './components/UpdateManager';

// Add to your layout
<UpdateManager />
```

### 2. Update Page
Located at `src/routes/update.tsx`

**Features:**
- Dedicated page for update management
- Detailed update information display
- Manual update checking
- Progress visualization

**Access:** Navigate to `/update` or use the "Check for Updates" button in Settings

### 3. Update Service
Located at `src/services/updateService.ts`

**Features:**
- Centralized update management
- Event handling for update events
- Service pattern for reusability

## Backend Integration

### Rust Commands
The following Tauri commands are available in the Rust backend:

- `check_for_updates()` - Triggers update checking
- `install_update()` - Installs available updates
- `get_app_version()` - Returns current app version
- `get_app_name()` - Returns app name

### Event Handling
The backend listens for Tauri update events and forwards them to the frontend:

- `tauri://update-available` → `update-available`
- `tauri://update-download-progress` → `update-download-progress`
- `tauri://update-download-finished` → `update-download-finished`
- `tauri://update-install` → `update-install`
- `tauri://update-error` → `update-error`

## Configuration

### Tauri Configuration
The updater is configured in `src-tauri/tauri.conf.json`:

```json
{
  "updater": {
    "active": true,
    "endpoints": [
      "https://github.com/Samer-Gassouma/Nqlix/releases/latest/download/latest.json"
    ],
    "dialog": false,
    "pubkey": "your-public-key-here"
  }
}
```

### GitHub Workflow
The release workflow automatically creates update files:
- `latest.json` - Update manifest
- `.sig` - Signature file for verification

## User Experience

### Update Flow
1. **Auto-check**: App checks for updates on startup
2. **Notification**: If update is available, dialog appears
3. **Download**: User can choose to download and install
4. **Progress**: Download progress is shown with percentage
5. **Installation**: App automatically restarts after installation

### Manual Check
1. Go to Settings page
2. Click "Check for Updates" button
3. Navigate to update page for detailed information
4. Choose to install or skip the update

## Error Handling

### Common Errors
- Network connectivity issues
- Invalid update signatures
- Insufficient disk space
- Permission issues

### Retry Mechanism
- Users can retry failed update checks
- Automatic error recovery where possible
- Clear error messages for user guidance

## Security

### Update Verification
- Updates are signed with a public key
- Signature verification prevents tampering
- Secure download from GitHub releases

### Best Practices
- Always verify update signatures
- Use HTTPS endpoints
- Implement proper error handling
- Provide clear user feedback

## Development

### Testing Updates
1. Create a new release tag (e.g., `v1.0.1`)
2. Push to GitHub to trigger the release workflow
3. Wait for the workflow to complete
4. Test the update in a development environment

### Local Development
- Update checking can be tested locally
- Use development builds for testing
- Monitor console logs for update events

## Troubleshooting

### Common Issues
1. **Update not detected**: Check network connectivity and GitHub release status
2. **Download fails**: Verify disk space and network connection
3. **Installation fails**: Check app permissions and antivirus settings
4. **Signature errors**: Verify the public key in configuration

### Debug Information
- Check browser console for update events
- Monitor Rust backend logs
- Verify GitHub release files are accessible

## Future Enhancements

### Planned Features
- Background update downloads
- Scheduled update checks
- Update rollback functionality
- Delta updates for smaller downloads
- Update notifications in system tray

### Configuration Options
- Update check frequency
- Auto-install settings
- Update channel selection (stable/beta)
- Custom update servers 