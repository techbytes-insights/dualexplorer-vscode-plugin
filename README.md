# Dual Explorer for VS Code

Browse two completely independent file trees inside the VS Code Explorer sidebar — each with its own root, filters, colors, and persistent state.

![Dual Explorer Screenshot](https://raw.githubusercontent.com/techbytes-insights/dualexplorer-vscode-plugin/main/release/screenshot.png)

[![Buy Me a Coffee](https://img.shields.io/badge/Buy%20Me%20a%20Coffee-support-%23FFDD00?style=for-the-badge&logo=buy-me-a-coffee&logoColor=black)](https://buymeacoffee.com/techbytesinsights)

---

## Features

- **Two independent explorer panels** — Explorer A and Explorer B each have their own root folder, expansion state, selection, and filter settings.
- **Persistent state** — root, filters, color, and expanded/selected items are all restored automatically when VS Code restarts.
- **Root management** — set or remove the root folder for each panel independently without affecting the other.
- **File filtering** — filter visible files by text, wildcard pattern, or a `.txt` allow-list.
- **Top-level directory filtering** — restrict the top-level folders shown using a regex pattern or a `.txt` allow-list.
- **Per-explorer color theming** — set a custom hex foreground color for items in each panel independently.
- **Full file operations** — create files/folders, rename, delete (with confirmation), copy path, reveal in OS, open in integrated terminal.
- **Drag and drop** — move files and folders within an explorer or across Explorer A ↔ B (with confirmation prompt).
- **Multi-select delete** — select multiple items and delete them in one action.
- **Expand All / Collapse All** — expand or collapse the entire tree with a single command.
- **Reveal current file** — jump to the active editor's file in either explorer.
- **Auto-refresh** — each explorer watches the file system and refreshes automatically on changes.
- **Status message** — each panel header shows the active root, filter, and color at a glance.

---

## Getting Started

1. Open the **Explorer** sidebar (`Ctrl+Shift+E`).
2. Scroll down to find **Explorer A** and **Explorer B** panels.
3. Click the toolbar icon or run **Dual Explorer: Select Root for Explorer A** (and/or B) to pick a root folder.

The root, filter, and color choices persist across VS Code restarts — no setup needed again.

---

## Root Management

Each explorer panel has its own independent root folder.

- **Select Root** — opens a folder picker and sets the root for that panel. Resets all filters, item color, expansion, and selection state for that panel so you start fresh in the new root.
- **Remove Root** — clears the root for that panel, resetting it to an empty state. The other panel is completely unaffected.

Run either command from the panel toolbar or via the Command Palette (`Ctrl+Shift+P`).

---

## File Filtering

File filters apply only to files (directories are always shown).

### Text / Wildcard Filter

Run **Dual Explorer: Set Filter for Explorer A** (or B). Enter:

| Input | Matches |
|-------|---------|
| `config` | any filename containing `config` |
| `*.ts` | filenames ending in `.ts` |
| `*.test.*` | filenames matching that wildcard pattern |

Filtering is case-insensitive by default. Enable case-sensitive matching via the setting `dualExplorer.filter.caseSensitive`.

### File Filter List (`.txt`)

Run **Dual Explorer: Set File Filter List (txt) for Explorer A** (or B) and choose a plain-text file. Each line is an exact filename to allow (e.g. `index.ts`). Only files whose name exactly matches an entry in the list are shown.

The text filter and the file filter list are **both applied** when both are active — a file must match both.

---

## Top-Level Directory Filtering

Top-level directory filters restrict which **root-level folders** appear in the tree. Sub-folders inside are unaffected.

### Regex Filter

Run **Dual Explorer: Set Top-Level Directory Regex for Explorer A** (or B). Enter any valid JavaScript regex, e.g. `^feature-` to show only folders whose name starts with `feature-`.

### Directory List (`.txt`)

Run **Dual Explorer: Set Top-Level Directory List (txt) for Explorer A** (or B) and choose a plain-text file. Each line is a folder name to allow at the root level.

The regex and directory list filters are **both applied** when both are active.

---

## Color Theming

Each explorer panel can have its own item text color.

Run **Dual Explorer: Set Item Color for Explorer A** (or B) and enter a 6-digit hex color (e.g. `#d4e8c2`). The color is saved globally in `workbench.colorCustomizations` and persists across sessions.

Run **Dual Explorer: Clear Item Color for Explorer A** (or B) to reset to the default theme color.

The underlying color tokens can also be set directly in `settings.json`:

```json
"workbench.colorCustomizations": {
  "dualExplorer.explorerAForeground": "#d4e8c2",
  "dualExplorer.explorerBForeground": "#c2d4e8"
}
```

---

## File Operations

Right-click any item in either explorer:

| Action | Available on |
|--------|-------------|
| New File | Folders |
| New Folder | Folders |
| Rename | Files and folders |
| Delete | Files and folders (moves to trash, supports multi-select) |
| Copy Path | Files and folders |
| Reveal in File Explorer | Files and folders |
| Open in Integrated Terminal | Files (opens at parent folder) and folders |

---

## Drag and Drop

Items can be dragged within Explorer A, within Explorer B, or **across** Explorer A ↔ B. Dropping onto a folder moves the item(s) into that folder. A confirmation prompt is shown before any move is performed.

---

## Commands

All commands are available via the Command Palette (`Ctrl+Shift+P`):

**Root**
- `Dual Explorer: Select Root for Explorer A`
- `Dual Explorer: Select Root for Explorer B`
- `Dual Explorer: Remove Root for Explorer A`
- `Dual Explorer: Remove Root for Explorer B`

**Refresh**
- `Dual Explorer: Refresh Explorer A`
- `Dual Explorer: Refresh Explorer B`
- `Dual Explorer: Refresh All`

**File Filter**
- `Dual Explorer: Set Filter for Explorer A`
- `Dual Explorer: Set Filter for Explorer B`
- `Dual Explorer: Clear Filter for Explorer A`
- `Dual Explorer: Clear Filter for Explorer B`
- `Dual Explorer: Set File Filter List (txt) for Explorer A`
- `Dual Explorer: Set File Filter List (txt) for Explorer B`
- `Dual Explorer: Clear File Filter List for Explorer A`
- `Dual Explorer: Clear File Filter List for Explorer B`

**Top-Level Directory Filter**
- `Dual Explorer: Set Top-Level Directory Regex for Explorer A`
- `Dual Explorer: Set Top-Level Directory Regex for Explorer B`
- `Dual Explorer: Clear Top-Level Directory Regex for Explorer A`
- `Dual Explorer: Clear Top-Level Directory Regex for Explorer B`
- `Dual Explorer: Set Top-Level Directory List (txt) for Explorer A`
- `Dual Explorer: Set Top-Level Directory List (txt) for Explorer B`
- `Dual Explorer: Clear Top-Level Directory List for Explorer A`
- `Dual Explorer: Clear Top-Level Directory List for Explorer B`

**Navigation**
- `Dual Explorer: Expand All in Explorer A`
- `Dual Explorer: Expand All in Explorer B`
- `Dual Explorer: Collapse All in Explorer A`
- `Dual Explorer: Collapse All in Explorer B`
- `Dual Explorer: Reveal Current File in Explorer A`
- `Dual Explorer: Reveal Current File in Explorer B`

**Color**
- `Dual Explorer: Set Item Color for Explorer A`
- `Dual Explorer: Set Item Color for Explorer B`
- `Dual Explorer: Clear Item Color for Explorer A`
- `Dual Explorer: Clear Item Color for Explorer B`

---

## Settings

| Setting | Type | Default | Description |
|---------|------|---------|-------------|
| `dualExplorer.filter.caseSensitive` | boolean | `false` | Use case-sensitive matching for file filters. |

---

## Requirements

VS Code **1.89.0** or later.

---

## Installation

### From VSIX (VS Code UI)

1. Download the latest `.vsix` from the [releases folder](https://github.com/techbytes-insights/dualexplorer-vscode-plugin/tree/main/release).
2. Open VS Code.
3. Press `Ctrl+Shift+P` → type **Extensions: Install from VSIX...**
4. Browse to and select the downloaded `.vsix` file.
5. Click **Reload** when prompted.

### From VSIX (terminal)

```bash
code --install-extension dual-explorer-1.5.0.vsix
```

Replace the filename with whichever version you downloaded.

### Using the installer script

**Linux / macOS**
```bash
bash install-dual-explorer.sh
```

**Windows (PowerShell)**
```powershell
.\install-dual-explorer.ps1
```

**Windows (Command Prompt)**
```cmd
install-dual-explorer.cmd
```

---

## Changelog

### 1.5.3
- Clear and Remove options in the panel menu now only appear when the corresponding setting is actually active (e.g. "Clear Filter" is hidden until a filter is set). The Reset toolbar button also hides when nothing is configured.

### 1.5.2
- Added **Reset Explorer A / B** command: clears root folder, all filters, item color, and expanded state in one step (with confirmation). Available in the panel toolbar, dropdown menu, and Command Palette.
- Added **Show Explorer A / B** commands to the Command Palette (`Ctrl+Shift+P`) for quick panel focus.

### 1.5.1
- Changing the root folder now resets all filters, item color, and expanded state for that panel automatically.

### 1.5.0
- Added **Remove Root** command for Explorer A and Explorer B independently.
- Added `repository` field to `package.json` for VS Code Marketplace publishing.

### 1.4.0
- Drag and drop support across Explorer A ↔ B.
- Multi-select delete.

### 1.3.1
- Bug fixes for filter list handling.

### 1.3.0
- Top-level directory filtering via regex and `.txt` allow-list.

### 1.2.1
- Stability fixes for file watcher and expand state persistence.

### 1.2.0
- Per-explorer color theming with `workbench.colorCustomizations` integration.

### 1.1.0
- File filter list (`.txt`) support.
- Reveal current file in explorer.

### 1.0.0
- Initial release with dual independent explorer panels, file filtering, persistent state, and full file operations.

---

## Development

```bash
npm install
npm run compile      # one-time build
npm run watch        # rebuild on change
npm run package:vsix # produce .vsix
```

Press `F5` in VS Code to launch an Extension Development Host with the extension loaded.

---

## Support

If you find this extension useful, consider supporting its development:

[![Buy Me a Coffee](https://img.shields.io/badge/Buy%20Me%20a%20Coffee-support-%23FFDD00?style=for-the-badge&logo=buy-me-a-coffee&logoColor=black)](https://buymeacoffee.com/techbytesinsights)
