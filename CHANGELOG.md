# Changelog

## 4.2.0

### Minor Changes

- Add video presence layout with AniList matching, extract AniList matcher into pure tested module, and implement VideoAnalyzerService to parse and sanitize video metadata and filenames

## 4.1.1

### Patch Changes

- 5271226: Fix video analyzer to handle directory paths in filenames (e.g. C:\folder\file.mkv)
- 3aa72d0: Fix release workflow to properly build binaries without auto-publishing

## 4.1.0

### Minor Changes

- 2e83ff7: Make listening status format consistent between playing and paused states
## 5.0.0

### Major Changes

- [`d6709d1`](https://github.com/valentin-marquez/vlc-rpc/commit/d6709d1f245b0b168ad820557573493194fa3132) Thanks [@valentin-marquez](https://github.com/valentin-marquez)! - VLC Discord RP v4.0.0 - Windows-Focused Major Update

  ## 🚨 BREAKING CHANGES

  **Windows-only support**: This version drops support for macOS and Linux to focus exclusively on delivering the best Windows experience. Users on other platforms should continue using v3.x releases.

  **Why this change was made:**

  - Allows for faster development cycles and better platform-specific optimizations
  - Enables focus on Windows-specific features and performance improvements
  - Reduces maintenance overhead and improves code quality

  **How to update:**

  - Windows users: Upgrade normally - all settings will be automatically migrated
  - macOS/Linux users: Continue using v3.x releases for cross-platform support

  ## ✨ Major New Features

  ### Discord RPC Tray Controls

  - Quick RPC Toggle: Enable/disable Discord RPC directly from system tray
  - Temporary Disable: Disable RPC for 15 minutes, 1 hour, or 2 hours with automatic re-activation
  - Smart Timers: Timer persistence control with intuitive defaults
  - Dynamic Menu: Tray shows remaining time when RPC is temporarily disabled

  ### Enhanced Media Detection

  - Smart Activity Types: Correctly shows 'Listening to {artist}' for music and 'Watching {series/movie}' for videos
  - Content Type Detection: Added support for music videos and documentaries
  - Advanced Analysis: Uses @ctrl/video-filename-parser for better series/movie identification

  ### Local Metadata System

  - Direct File Access: Extracts album cover art from audio file metadata
  - Cloud Upload & Caching: Uploads covers to https://0x0.st/ with local caching for better performance
  - No More Remote Searches: Eliminates need for remote fingerprinting for audio files
  - Cache Management: New setting to clear metadata cache when needed

  ### Technical Improvements

  - Electron Vite Migration: Faster builds and improved development experience
  - Changesets Integration: Automated versioning and professional changelog generation
  - Video Analyzer: Intelligent content type detection service
  - Portable Detection: Enhanced portable version handling

  ## 🔧 Improvements

  - Better Connection Stability: Updated Discord libraries and improved reconnection logic
  - Tray Icon Management: Fixed duplication issues after system sleep/wake cycles
  - File Handling: Proper URL decoding for files with special characters
  - Settings UI: Simplified interface with version info moved to Application Settings
  - Build System: Fixed portable build generation issues

  ## 🐛 Bug Fixes

  - Fixed tray icon duplication after system sleep/wake cycles
  - Resolved album art loading for files with spaces and special characters
  - Fixed portable build configuration problems
  - Improved Discord connection reliability
  - Enhanced error handling and recovery mechanisms

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [4.0.2] - 2025-10-02

### Fixed

**Image Upload Service Issues**

- Fixed HTTP 403 errors when uploading cover art images
- Resolved User-Agent blocking issues with 0x0.st service
- Improved upload reliability and success rates

### Added
- **Discord RPC Tray Controls**: Complete RPC management from system tray
  - Quick RPC Toggle: Enable/disable Discord RPC permanently from tray menu
  - Temporary Disable Options: Disable RPC for predefined durations (15 minutes, 1 hour, 2 hours)
  - Timer Persistence Control: New setting to control whether RPC timers persist across app restarts
  - Dynamic Menu Updates: Tray menu shows remaining time when RPC is temporarily disabled
  - Automatic Re-activation: RPC automatically re-enables when temporary timer expires
- **Enhanced Media Type Detection**:
  - Added support for music_video and documentary content types
  - Improved video identification methods with advanced content analysis
  - Better media state detection for accurate Discord status
- **Metadata Management System**:
  - New metadata handler for centralized metadata operations
  - Image uploader service for uploading cover art to 0x0.st with metadata tagging
  - Metadata writer service for improved metadata management
  - Video analyzer service for content type determination
- **Application Features**:
  - Portable version detection and handling
  - App info handler for system information
  - Automated issue response templates for better support
- **Developer Experience**:
  - Changesets integration for automated versioning and changelog generation
  - GitHub Actions CI/CD pipeline with automated releases
  - PR bot for changeset validation and contributor guidance
  - Migration to Electron Vite for improved build performance

**Multi-Service Image Upload System**

- Implemented automatic fallback between multiple image hosting services
- Added support for x0.at, catbox.moe, uguu.se, tmpfiles.org, and 0x0.st
- User-Agent rotation system to prevent service blocking
- Intelligent service selection based on file size limits
- Automatic retry logic with different services on failure
- **Media Detection Improvements**:
  - Replaced MediaActivityType enum with ActivityType from discord-api-types
  - Expanded VlcRawStatus with new properties for better media tracking
  - Added VlcStreamInfo and VlcMetadata interfaces for detailed media information
  - Implemented VlcPlaylistResponse and VlcPlaylistItem interfaces
- **Settings UI Simplification**:
  - Moved version and installation type info to Application Settings
  - Removed manual update check buttons (updates now automatic)
  - Updated minimize to tray behavior (only applies to minimize button, not close)
  - Hide "Start with System" option for portable versions
- **Build Configuration**:
  - Updated to target Windows only
  - Fixed portable build generation issues
  - Streamlined resource paths and configurations
  - Updated electron-builder configuration for better artifact naming

### Improved

- Enhanced error handling and logging for image upload operations
- Better service reliability through diversified hosting providers
- Reduced dependency on single image hosting service

## [4.0.1] - 2025-08-05

### BREAKING CHANGES

- Dropped support for macOS and Linux platforms to focus exclusively on Windows optimization
- Removed cross-platform CI/CD workflows and build configurations

### Added

**Discord RPC Tray Controls**

- System tray integration for Discord RPC management
- Quick toggle functionality for enabling/disabling RPC
- Temporary disable options (15 minutes, 1 hour, 2 hours)
- Real-time countdown display in tray menu when temporarily disabled

**Enhanced Media Detection System**

- Support for additional content types: `music_video` and `documentary`
- Improved video content analysis algorithms
- Enhanced media state detection for more accurate Discord status updates
- Better identification methods for various media formats

**Metadata Management Infrastructure**

- Centralized metadata handler with IPC communication system
- Image uploader service with 0x0.st integration for cover art hosting
- Automated video analyzer for content type determination
- Metadata writer service for improved data management

**Development Tools and Build System**

- Migration to Electron Vite build system for improved performance and developer experience
- Enhanced GitHub Actions CI/CD pipeline
- Simplified manual release workflow
- Issue response templates for better support

### Changed

**User Interface**

- Simplified settings interface by removing manual update controls
- Relocated application information to dedicated settings section
- Updated minimize-to-tray behavior for better user experience
- Hidden system startup options for portable installations
- Improved layout and scrolling behavior

**API and Type System**

- Replaced custom `MediaActivityType` enum with `ActivityType` from discord-api-types
- Enhanced `VlcRawStatus` interface with additional properties for better media tracking
- Introduced new interfaces: `VlcStreamInfo`, `VlcMetadata`, `VlcPlaylistResponse`, and `VlcPlaylistItem`
- Improved type safety across the application

**Build Configuration**

- Updated build targets to Windows-only architecture
- Fixed portable version generation issues
- Streamlined resource paths and build configurations
- Improved artifact naming conventions in electron-builder

### Fixed

- Resolved tray icon duplication issues occurring after system sleep/wake cycles
- Fixed album art loading problems for files with special characters or spaces in filenames using `url.fileURLToPath()`
- Corrected portable build generation with proper NSIS configuration
- Improved code quality by removing unused comments and redundant implementations

### Removed

- macOS and Linux build targets and platform-specific code
- Cross-platform compatibility layers and dependencies
- Manual update check functionality from user interface
- Deprecated `MediaActivityType` enum
- Legacy code comments and unused implementations
- Changesets workflow (simplified to manual releases)

---

## [3.0.0] - Previous Release

### Added

- Cross-platform support for Windows, macOS, and Linux operating systems
- Automatic updates system with seamless installation process
- Smart content detection for TV shows, movies, and anime content
- Activity type precision with listening and watching states
- Modern user interface with light and dark theme support
- System tray integration for background operation management

### Changed

- Complete user interface redesign with improved usability
- Enhanced VLC reconnection logic for better stability
- Improved error handling and user feedback systems

### Fixed

- Connection stability issues with VLC Media Player
- Media detection accuracy for various file formats
- Memory leaks in long-running application sessions
