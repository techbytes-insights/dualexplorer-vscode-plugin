import * as path from "path";
import * as vscode from "vscode";

type ExplorerKey = "A" | "B";

interface ExplorerState {
  rootUri?: string;
  filter: string;
  filterList: string[];
  topLevelDirRegex: string;
  topLevelDirList: string[];
  expandedUris: string[];
  selectedUri?: string;
  foregroundColor: string;
}

class ExplorerItem extends vscode.TreeItem {
  constructor(
    public readonly explorerKey: ExplorerKey,
    public readonly uri: vscode.Uri,
    public readonly isDirectory: boolean,
    public readonly parent?: ExplorerItem,
    collapsibleState: vscode.TreeItemCollapsibleState = vscode.TreeItemCollapsibleState.None
  ) {
    super(path.basename(uri.fsPath), collapsibleState);

    this.id = uri.toString();
    // Virtual scheme keeps file decorations scoped to our panels only.
    // The native file explorer uses file:// URIs; ours use dualexplorer://, so
    // the FileDecorationProvider is never called for items outside our views.
    this.resourceUri = vscode.Uri.from({ scheme: "dualexplorer", authority: explorerKey.toLowerCase(), path: uri.path });
    this.iconPath = new vscode.ThemeIcon(isDirectory ? "folder" : "file");
    this.contextValue = isDirectory ? "folder" : "file";

    if (!isDirectory) {
      this.command = {
        command: "dualExplorer.open",
        title: "Open",
        arguments: [this]
      };
    }
  }
}

class DualExplorerProvider implements vscode.TreeDataProvider<ExplorerItem>, vscode.TreeDragAndDropController<ExplorerItem>, vscode.Disposable {
  private readonly _onDidChangeTreeData = new vscode.EventEmitter<ExplorerItem | undefined>();
  readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

  readonly dragMimeTypes: string[];

  readonly dropMimeTypes = [
    "application/vnd.code.tree.dualExplorerA",
    "application/vnd.code.tree.dualExplorerB",
    "text/uri-list"
  ];

  private rootUri?: vscode.Uri;
  private filter = "";
  private filterList: string[] = [];
  private topLevelDirRegex = "";
  private topLevelDirList: string[] = [];
  private foregroundColor = "";
  private expanded = new Set<string>();
  private selectedUri?: string;
  private disposables: vscode.Disposable[] = [];
  private watcher?: vscode.FileSystemWatcher;
  private refreshTimer?: NodeJS.Timeout;

  constructor(
    private readonly context: vscode.ExtensionContext,
    private readonly viewId: string,
    private readonly key: ExplorerKey,
    private readonly onCrossTreeMutation: () => void
  ) {
    this.dragMimeTypes = [
      `application/vnd.code.tree.${this.viewId}`,
      "text/uri-list"
    ];

    const state = this.getState();
    this.filter = state.filter;
    this.filterList = state.filterList ?? [];
    this.topLevelDirRegex = state.topLevelDirRegex;
    this.topLevelDirList = state.topLevelDirList ?? [];
    this.foregroundColor = state.foregroundColor ?? "";
    this.selectedUri = state.selectedUri;

    if (state.rootUri) {
      this.rootUri = vscode.Uri.parse(state.rootUri);
    }

    for (const uri of state.expandedUris) {
      this.expanded.add(uri);
    }

    this.recreateWatcher();
  }

  dispose(): void {
    this.watcher?.dispose();
    this.disposables.forEach((d) => d.dispose());
    if (this.refreshTimer) {
      clearTimeout(this.refreshTimer);
    }
  }

  getRootUri(): vscode.Uri | undefined {
    return this.rootUri;
  }

  getFilter(): string {
    return this.filter;
  }

  getTopLevelDirRegex(): string {
    return this.topLevelDirRegex;
  }

  setRootUri(uri: vscode.Uri): void {
    this.rootUri = uri;
    this.expanded.clear();
    this.selectedUri = undefined;
    this.persistState();
    this.recreateWatcher();
    this.refresh();
  }

  clearRootUri(): void {
    this.rootUri = undefined;
    this.expanded.clear();
    this.selectedUri = undefined;
    this.persistState();
    this.recreateWatcher();
    this.refresh();
  }

  setFilter(filter: string): void {
    this.filter = filter.trim();
    this.persistState();
    this.refresh();
  }

  clearFilter(): void {
    this.filter = "";
    this.persistState();
    this.refresh();
  }

  setTopLevelDirRegex(pattern: string): void {
    this.topLevelDirRegex = pattern.trim();
    this.persistState();
    this.refresh();
  }

  clearTopLevelDirRegex(): void {
    this.topLevelDirRegex = "";
    this.persistState();
    this.refresh();
  }

  getFilterList(): string[] {
    return this.filterList;
  }

  setFilterList(list: string[]): void {
    this.filterList = list;
    this.persistState();
    this.refresh();
  }

  clearFilterList(): void {
    this.filterList = [];
    this.persistState();
    this.refresh();
  }

  getTopLevelDirList(): string[] {
    return this.topLevelDirList;
  }

  setTopLevelDirList(list: string[]): void {
    this.topLevelDirList = list;
    this.persistState();
    this.refresh();
  }

  clearTopLevelDirList(): void {
    this.topLevelDirList = [];
    this.persistState();
    this.refresh();
  }

  getForegroundColor(): string {
    return this.foregroundColor;
  }

  setForegroundColor(color: string): void {
    this.foregroundColor = color;
    this.persistState();
  }

  clearForegroundColor(): void {
    this.foregroundColor = "";
    this.persistState();
  }

  refresh(): void {
    this._onDidChangeTreeData.fire(undefined);
  }

  collapseAll(): void {
    this.expanded.clear();
    this.persistState();
    this.refresh();
  }

  async expandAll(): Promise<void> {
    if (!this.rootUri) {
      vscode.window.showInformationMessage(`Set a root folder for Explorer ${this.key} first.`);
      return;
    }
    await this.collectAllDirs(this.rootUri);
    this.persistState();
    this.refresh();
  }

  private async collectAllDirs(parentUri: vscode.Uri): Promise<void> {
    try {
      const entries = await vscode.workspace.fs.readDirectory(parentUri);
      for (const [name, fileType] of entries) {
        const isDirectory = (fileType & vscode.FileType.Directory) !== 0;
        if (!isDirectory) {
          continue;
        }
        if (!this.matchesTopLevelDirectoryRegex(parentUri, name, isDirectory)) {
          continue;
        }
        const uri = vscode.Uri.joinPath(parentUri, name);
        this.expanded.add(uri.toString());
        await this.collectAllDirs(uri);
      }
    } catch {
      // ignore inaccessible directories
    }
  }

  trackView(view: vscode.TreeView<ExplorerItem>): void {
    this.disposables.push(
      view.onDidExpandElement((e) => {
        this.expanded.add(e.element.uri.toString());
        this.persistState();
      })
    );

    this.disposables.push(
      view.onDidCollapseElement((e) => {
        this.expanded.delete(e.element.uri.toString());
        this.persistState();
      })
    );

    this.disposables.push(
      view.onDidChangeSelection((e) => {
        this.selectedUri = e.selection[0]?.uri.toString();
        this.persistState();
      })
    );
  }

  async revealCurrentFile(view: vscode.TreeView<ExplorerItem>): Promise<void> {
    const editorUri = vscode.window.activeTextEditor?.document.uri;
    if (!editorUri || editorUri.scheme !== "file") {
      vscode.window.showInformationMessage("No active file to reveal.");
      return;
    }

    const root = this.rootUri;
    if (!root) {
      vscode.window.showInformationMessage(`Set a root folder for Explorer ${this.key} first.`);
      return;
    }

    const rootPath = root.fsPath;
    if (!editorUri.fsPath.startsWith(rootPath)) {
      vscode.window.showInformationMessage(`Active file is not inside Explorer ${this.key} root.`);
      return;
    }

    await this.expandParentsFor(editorUri);
    const item = await this.findItemByUri(editorUri);
    if (!item) {
      vscode.window.showInformationMessage("File not found in explorer tree.");
      return;
    }

    await view.reveal(item, { select: true, focus: true, expand: true });
  }

  async restoreLastSelection(view: vscode.TreeView<ExplorerItem>): Promise<void> {
    if (!this.selectedUri || !this.rootUri) {
      return;
    }

    let targetUri: vscode.Uri;
    try {
      targetUri = vscode.Uri.parse(this.selectedUri);
    } catch {
      return;
    }

    if (!targetUri.fsPath.startsWith(this.rootUri.fsPath)) {
      return;
    }

    await this.expandParentsFor(targetUri);
    const item = await this.findItemByUri(targetUri);
    if (!item) {
      return;
    }

    try {
      await view.reveal(item, { select: true, focus: false, expand: true });
    } catch {
      // Ignore reveal failures when view is not ready yet.
    }
  }

  getTreeItem(element: ExplorerItem): vscode.TreeItem {
    return element;
  }

  async getChildren(element?: ExplorerItem): Promise<ExplorerItem[]> {
    if (!this.rootUri) {
      return [];
    }

    const parentUri = element?.uri ?? this.rootUri;

    try {
      const entries = await vscode.workspace.fs.readDirectory(parentUri);
      entries.sort((a, b) => {
        if (a[1] !== b[1]) {
          return a[1] === vscode.FileType.Directory ? -1 : 1;
        }
        return a[0].localeCompare(b[0]);
      });

      const items: ExplorerItem[] = [];
      for (const [name, fileType] of entries) {
        const uri = vscode.Uri.joinPath(parentUri, name);
        const isDirectory = (fileType & vscode.FileType.Directory) !== 0;

        if (!this.matchesTopLevelDirectoryRegex(parentUri, name, isDirectory)) {
          continue;
        }

        if (!this.matchesFilter(name, isDirectory)) {
          continue;
        }

        const collapsibleState = isDirectory
          ? this.expanded.has(uri.toString())
            ? vscode.TreeItemCollapsibleState.Expanded
            : vscode.TreeItemCollapsibleState.Collapsed
          : vscode.TreeItemCollapsibleState.None;

        items.push(new ExplorerItem(this.key, uri, isDirectory, element, collapsibleState));
      }

      return items;
    } catch {
      return [];
    }
  }

  getParent(element: ExplorerItem): vscode.ProviderResult<ExplorerItem> {
    return element.parent;
  }

  async handleDrag(source: readonly ExplorerItem[], dataTransfer: vscode.DataTransfer): Promise<void> {
    const uris = source.map((item) => item.uri.toString());
    const serialized = JSON.stringify(uris);

    dataTransfer.set(`application/vnd.code.tree.${this.viewId}`, new vscode.DataTransferItem(serialized));
    dataTransfer.set("text/uri-list", new vscode.DataTransferItem(uris.join("\r\n")));
  }

  async handleDrop(target: ExplorerItem | undefined, dataTransfer: vscode.DataTransfer): Promise<void> {
    const destinationFolder = await this.resolveDropDestination(target);
    if (!destinationFolder) {
      return;
    }

    const sourceUris = await this.getDroppedUris(dataTransfer);
    if (sourceUris.length === 0) {
      return;
    }

    const moveLabel = sourceUris.length === 1 ? "Move" : `Move ${sourceUris.length} items`;
    const confirm = await vscode.window.showWarningMessage(
      `Move ${sourceUris.length} item(s) to ${destinationFolder.fsPath}?`,
      { modal: true },
      moveLabel
    );

    if (confirm !== moveLabel) {
      return;
    }

    for (const source of sourceUris) {
      const destination = vscode.Uri.joinPath(destinationFolder, path.basename(source.fsPath));
      if (source.toString() === destination.toString()) {
        continue;
      }

      try {
        await vscode.workspace.fs.rename(source, destination, { overwrite: false });
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        vscode.window.showErrorMessage(`Unable to move ${source.fsPath}: ${message}`);
      }
    }

    this.refresh();
    this.onCrossTreeMutation();
  }

  async open(item: ExplorerItem): Promise<void> {
    if (item.isDirectory) {
      return;
    }
    await vscode.window.showTextDocument(item.uri, { preview: false });
  }

  async createChild(item: ExplorerItem | undefined, type: "file" | "folder"): Promise<void> {
    const base = await this.resolveDirectoryForNewItem(item);
    if (!base) {
      return;
    }

    const label = type === "file" ? "New file name" : "New folder name";
    const name = await vscode.window.showInputBox({
      prompt: `${label} in ${base.fsPath}`,
      ignoreFocusOut: true,
      validateInput: (value) => (value.trim().length ? undefined : "Name is required")
    });

    if (!name) {
      return;
    }

    const target = vscode.Uri.joinPath(base, name.trim());

    try {
      if (type === "file") {
        await vscode.workspace.fs.writeFile(target, new Uint8Array());
        await vscode.window.showTextDocument(target);
      } else {
        await vscode.workspace.fs.createDirectory(target);
      }
      this.refresh();
      this.onCrossTreeMutation();
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      vscode.window.showErrorMessage(`Unable to create ${type}: ${message}`);
    }
  }

  async rename(item: ExplorerItem): Promise<void> {
    const currentName = path.basename(item.uri.fsPath);
    const nextName = await vscode.window.showInputBox({
      prompt: "New name",
      value: currentName,
      ignoreFocusOut: true,
      validateInput: (value) => (value.trim().length ? undefined : "Name is required")
    });

    if (!nextName || nextName === currentName) {
      return;
    }

    const parent = vscode.Uri.file(path.dirname(item.uri.fsPath));
    const target = vscode.Uri.joinPath(parent, nextName.trim());

    try {
      await vscode.workspace.fs.rename(item.uri, target, { overwrite: false });
      this.refresh();
      this.onCrossTreeMutation();
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      vscode.window.showErrorMessage(`Unable to rename: ${message}`);
    }
  }

  async delete(items: ExplorerItem[]): Promise<void> {
    if (items.length === 0) {
      return;
    }

    const label = items.length === 1 ? path.basename(items[0].uri.fsPath) : `${items.length} items`;
    const confirmed = await vscode.window.showWarningMessage(
      `Delete ${label}?`,
      { modal: true },
      "Delete"
    );

    if (confirmed !== "Delete") {
      return;
    }

    for (const item of items) {
      try {
        await vscode.workspace.fs.delete(item.uri, { recursive: true, useTrash: true });
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        vscode.window.showErrorMessage(`Unable to delete ${item.uri.fsPath}: ${message}`);
      }
    }

    this.refresh();
    this.onCrossTreeMutation();
  }

  async copyPath(item: ExplorerItem): Promise<void> {
    await vscode.env.clipboard.writeText(item.uri.fsPath);
    vscode.window.setStatusBarMessage("Path copied", 1200);
  }

  async revealInOS(item: ExplorerItem): Promise<void> {
    await vscode.commands.executeCommand("revealFileInOS", item.uri);
  }

  async openTerminalHere(item?: ExplorerItem): Promise<void> {
    const cwd = item
      ? item.isDirectory
        ? item.uri.fsPath
        : path.dirname(item.uri.fsPath)
      : this.rootUri?.fsPath;

    if (!cwd) {
      vscode.window.showInformationMessage(`Set a root folder for Explorer ${this.key} first.`);
      return;
    }

    const terminal = vscode.window.createTerminal({
      name: `Dual Explorer ${this.key}`,
      cwd
    });
    terminal.show();
  }

  getSelectedItemsFromView(view: vscode.TreeView<ExplorerItem>, fallback?: ExplorerItem): ExplorerItem[] {
    const selected = view.selection.length ? [...view.selection] : fallback ? [fallback] : [];
    const byId = new Map<string, ExplorerItem>();

    for (const item of selected) {
      byId.set(item.uri.toString(), item);
    }

    return [...byId.values()];
  }

  private getState(): ExplorerState {
    const fallback: ExplorerState = {
      filter: "",
      filterList: [],
      topLevelDirRegex: "",
      topLevelDirList: [],
      expandedUris: [],
      foregroundColor: ""
    };

    return this.context.globalState.get<ExplorerState>(this.stateKey, fallback);
  }

  private persistState(): void {
    const payload: ExplorerState = {
      rootUri: this.rootUri?.toString(),
      filter: this.filter,
      filterList: this.filterList,
      topLevelDirRegex: this.topLevelDirRegex,
      topLevelDirList: this.topLevelDirList,
      expandedUris: [...this.expanded],
      selectedUri: this.selectedUri,
      foregroundColor: this.foregroundColor
    };

    void this.context.globalState.update(this.stateKey, payload);
  }

  private get stateKey(): string {
    return `dualExplorer.state.${this.key}`;
  }

  private recreateWatcher(): void {
    this.watcher?.dispose();
    this.watcher = undefined;

    if (!this.rootUri) {
      return;
    }

    const pattern = new vscode.RelativePattern(this.rootUri, "**/*");
    this.watcher = vscode.workspace.createFileSystemWatcher(pattern);

    const scheduleRefresh = () => {
      if (this.refreshTimer) {
        clearTimeout(this.refreshTimer);
      }
      this.refreshTimer = setTimeout(() => this.refresh(), 250);
    };

    this.watcher.onDidCreate(scheduleRefresh);
    this.watcher.onDidChange(scheduleRefresh);
    this.watcher.onDidDelete(scheduleRefresh);

    this.disposables.push(this.watcher);
  }

  private matchesFilter(name: string, isDirectory: boolean): boolean {
    if (isDirectory) {
      return true;
    }

    if (!this.filter && this.filterList.length === 0) {
      return true;
    }

    const caseSensitive = vscode.workspace.getConfiguration("dualExplorer").get<boolean>("filter.caseSensitive", false);

    if (this.filter) {
      const escaped = this.escapeForRegex(this.filter).replace(/\\\*/g, ".*");
      const regex = new RegExp(`^${escaped}$`, caseSensitive ? "" : "i");

      const matchesText = this.filter.includes("*")
        ? regex.test(name)
        : (caseSensitive ? name : name.toLowerCase()).includes(caseSensitive ? this.filter : this.filter.toLowerCase());

      if (!matchesText) {
        return false;
      }
    }

    if (this.filterList.length > 0) {
      const matchesList = this.filterList.some((entry) =>
        caseSensitive ? entry === name : entry.toLowerCase() === name.toLowerCase()
      );
      if (!matchesList) {
        return false;
      }
    }

    return true;
  }

  private matchesTopLevelDirectoryRegex(parentUri: vscode.Uri, name: string, isDirectory: boolean): boolean {
    if (!isDirectory || !this.rootUri) {
      return true;
    }

    if (parentUri.toString() !== this.rootUri.toString()) {
      return true;
    }

    if (this.topLevelDirRegex) {
      try {
        if (!new RegExp(this.topLevelDirRegex).test(name)) {
          return false;
        }
      } catch {
        // Ignore invalid regex at render-time; set command validates patterns.
      }
    }

    if (this.topLevelDirList.length > 0) {
      if (!this.topLevelDirList.includes(name)) {
        return false;
      }
    }

    return true;
  }

  private escapeForRegex(input: string): string {
    return input.replace(/[|\\{}()[\]^$+?.]/g, "\\$&");
  }

  private async resolveDirectoryForNewItem(item?: ExplorerItem): Promise<vscode.Uri | undefined> {
    if (item && item.isDirectory) {
      return item.uri;
    }

    if (item && !item.isDirectory) {
      return vscode.Uri.file(path.dirname(item.uri.fsPath));
    }

    return this.rootUri;
  }

  private async resolveDropDestination(target?: ExplorerItem): Promise<vscode.Uri | undefined> {
    if (!target) {
      return this.rootUri;
    }

    if (target.isDirectory) {
      return target.uri;
    }

    return vscode.Uri.file(path.dirname(target.uri.fsPath));
  }

  private async getDroppedUris(dataTransfer: vscode.DataTransfer): Promise<vscode.Uri[]> {
    const seen = new Set<string>();
    const values: vscode.Uri[] = [];

    const candidates = [
      "application/vnd.code.tree.dualExplorerA",
      "application/vnd.code.tree.dualExplorerB",
      "text/uri-list"
    ];

    for (const key of candidates) {
      const item = dataTransfer.get(key);
      if (!item) {
        continue;
      }

      const value = await item.asString();
      if (!value) {
        continue;
      }

      if (key === "text/uri-list") {
        for (const line of value.split(/\r?\n/)) {
          const trimmed = line.trim();
          if (!trimmed || trimmed.startsWith("#")) {
            continue;
          }

          try {
            const uri = vscode.Uri.parse(trimmed);
            if (uri.scheme === "file" && !seen.has(uri.toString())) {
              seen.add(uri.toString());
              values.push(uri);
            }
          } catch {
            // Ignore malformed URI lines from external drag sources.
          }
        }
      } else {
        try {
          const serialized: string[] = JSON.parse(value);
          for (const rawUri of serialized) {
            const uri = vscode.Uri.parse(rawUri);
            if (uri.scheme === "file" && !seen.has(uri.toString())) {
              seen.add(uri.toString());
              values.push(uri);
            }
          }
        } catch {
          // Ignore malformed payloads.
        }
      }
    }

    return values;
  }

  private async expandParentsFor(uri: vscode.Uri): Promise<void> {
    if (!this.rootUri) {
      return;
    }

    const rootPath = this.rootUri.fsPath;
    let current = path.dirname(uri.fsPath);

    while (current.length >= rootPath.length && current.startsWith(rootPath)) {
      const currentUri = vscode.Uri.file(current);
      this.expanded.add(currentUri.toString());
      if (current === rootPath) {
        break;
      }
      current = path.dirname(current);
    }

    this.persistState();
    this.refresh();
  }

  private async findItemByUri(target: vscode.Uri): Promise<ExplorerItem | undefined> {
    if (!this.rootUri) {
      return undefined;
    }

    if (target.toString() === this.rootUri.toString()) {
      return new ExplorerItem(this.key, this.rootUri, true, undefined, vscode.TreeItemCollapsibleState.Expanded);
    }

    const relative = path.relative(this.rootUri.fsPath, target.fsPath);
    if (!relative || relative.startsWith("..")) {
      return undefined;
    }

    const parts = relative.split(path.sep).filter(Boolean);
    let parent: ExplorerItem | undefined;
    let currentUri = this.rootUri;

    for (let i = 0; i < parts.length; i += 1) {
      currentUri = vscode.Uri.joinPath(currentUri, parts[i]);
      const isLast = i === parts.length - 1;
      let stat: vscode.FileStat;

      try {
        stat = await vscode.workspace.fs.stat(currentUri);
      } catch {
        return undefined;
      }

      const isDirectory = (stat.type & vscode.FileType.Directory) !== 0;
      const state = isDirectory
        ? this.expanded.has(currentUri.toString())
          ? vscode.TreeItemCollapsibleState.Expanded
          : vscode.TreeItemCollapsibleState.Collapsed
        : vscode.TreeItemCollapsibleState.None;

      const item = new ExplorerItem(this.key, currentUri, isDirectory, parent, state);
      parent = item;

      if (isLast) {
        return item;
      }
    }

    return undefined;
  }
}

export function activate(context: vscode.ExtensionContext): void {
  const providers: Record<ExplorerKey, DualExplorerProvider> = {
    A: undefined as unknown as DualExplorerProvider,
    B: undefined as unknown as DualExplorerProvider
  };

  const refreshAll = () => {
    providers.A?.refresh();
    providers.B?.refresh();
  };

  providers.A = new DualExplorerProvider(context, "dualExplorerA", "A", refreshAll);
  providers.B = new DualExplorerProvider(context, "dualExplorerB", "B", refreshAll);

  const viewA = vscode.window.createTreeView("dualExplorerA", {
    treeDataProvider: providers.A,
    dragAndDropController: providers.A,
    showCollapseAll: true,
    canSelectMany: true
  });

  const viewB = vscode.window.createTreeView("dualExplorerB", {
    treeDataProvider: providers.B,
    dragAndDropController: providers.B,
    showCollapseAll: true,
    canSelectMany: true
  });

  providers.A.trackView(viewA);
  providers.B.trackView(viewB);

  const setViewMessages = () => {
    viewA.message = providers.A.getRootUri()
      ? [
          `Root: ${providers.A.getRootUri()!.fsPath}`,
          providers.A.getFilter() ? `Filter: ${providers.A.getFilter()}` : "",
          providers.A.getFilterList().length ? `File list: ${providers.A.getFilterList().length} entries` : "",
          providers.A.getTopLevelDirRegex() ? `Top-level dir regex: ${providers.A.getTopLevelDirRegex()}` : "",
          providers.A.getTopLevelDirList().length ? `Top-level dir list: ${providers.A.getTopLevelDirList().length} folders` : "",
          providers.A.getForegroundColor() ? `Foreground: ${providers.A.getForegroundColor()}` : ""
        ].filter(Boolean).join("\n")
      : "Run \"Dual Explorer: Select Root for Explorer A\"";

    viewB.message = providers.B.getRootUri()
      ? [
          `Root: ${providers.B.getRootUri()!.fsPath}`,
          providers.B.getFilter() ? `Filter: ${providers.B.getFilter()}` : "",
          providers.B.getFilterList().length ? `File list: ${providers.B.getFilterList().length} entries` : "",
          providers.B.getTopLevelDirRegex() ? `Top-level dir regex: ${providers.B.getTopLevelDirRegex()}` : "",
          providers.B.getTopLevelDirList().length ? `Top-level dir list: ${providers.B.getTopLevelDirList().length} folders` : "",
          providers.B.getForegroundColor() ? `Foreground: ${providers.B.getForegroundColor()}` : ""
        ].filter(Boolean).join("\n")
      : "Run \"Dual Explorer: Select Root for Explorer B\"";
  };

  const refreshWithMessages = () => {
    setViewMessages();
    refreshAll();
  };

  refreshWithMessages();

  const removeRoot = (key: ExplorerKey): void => {
    providers[key].clearRootUri();
    refreshWithMessages();
  };

  const selectRoot = async (key: ExplorerKey): Promise<void> => {
    const selected = await vscode.window.showOpenDialog({
      canSelectFolders: true,
      canSelectFiles: false,
      canSelectMany: false,
      openLabel: `Select root for Explorer ${key}`
    });

    if (!selected?.length) {
      return;
    }

    providers[key].setRootUri(selected[0]);
    refreshWithMessages();
  };

  const setFilter = async (key: ExplorerKey): Promise<void> => {
    const provider = providers[key];
    const value = await vscode.window.showInputBox({
      prompt: `Filter for Explorer ${key} (e.g. *.ts or config)`,
      value: provider.getFilter(),
      ignoreFocusOut: true
    });

    if (value === undefined) {
      return;
    }

    provider.setFilter(value);
    refreshWithMessages();
  };

  const clearFilter = (key: ExplorerKey): void => {
    providers[key].clearFilter();
    refreshWithMessages();
  };

  const setTopLevelDirRegex = async (key: ExplorerKey): Promise<void> => {
    const provider = providers[key];
    const current = provider.getTopLevelDirRegex();

    const value = await vscode.window.showInputBox({
      prompt: `Top-level directory regex for Explorer ${key} (example: ^ATMOx.*)`,
      value: current,
      ignoreFocusOut: true
    });

    if (value === undefined) {
      return;
    }

    const nextValue = value.trim();
    if (nextValue) {
      try {
        void new RegExp(nextValue);
      } catch {
        vscode.window.showErrorMessage("Invalid regex pattern. Top-level directory regex was not updated.");
        return;
      }
    }

    provider.setTopLevelDirRegex(nextValue);
    refreshWithMessages();
  };

  const clearTopLevelDirRegex = (key: ExplorerKey): void => {
    providers[key].clearTopLevelDirRegex();
    refreshWithMessages();
  };

  const readListFile = async (openLabel: string): Promise<string[] | undefined> => {
    const selected = await vscode.window.showOpenDialog({
      canSelectFiles: true,
      canSelectFolders: false,
      canSelectMany: false,
      filters: { "Text files": ["txt"] },
      openLabel
    });

    if (!selected?.length) {
      return undefined;
    }

    const raw = await vscode.workspace.fs.readFile(selected[0]);
    const list = new TextDecoder().decode(raw)
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line.length > 0);

    if (list.length === 0) {
      vscode.window.showWarningMessage("The selected file contains no entries.");
      return undefined;
    }

    return list;
  };

  const setFilterList = async (key: ExplorerKey): Promise<void> => {
    const list = await readListFile(`Select file name list for Explorer ${key}`);
    if (!list) {
      return;
    }
    providers[key].setFilterList(list);
    refreshWithMessages();
  };

  const clearFilterList = (key: ExplorerKey): void => {
    providers[key].clearFilterList();
    refreshWithMessages();
  };

  const setTopLevelDirList = async (key: ExplorerKey): Promise<void> => {
    const list = await readListFile(`Select folder name list for Explorer ${key}`);
    if (!list) {
      return;
    }
    providers[key].setTopLevelDirList(list);
    refreshWithMessages();
  };

  const clearTopLevelDirList = (key: ExplorerKey): void => {
    providers[key].clearTopLevelDirList();
    refreshWithMessages();
  };

  const collapseAll = (key: ExplorerKey): void => {
    providers[key].collapseAll();
    refreshWithMessages();
  };

  const expandAll = async (key: ExplorerKey): Promise<void> => {
    await providers[key].expandAll();
    refreshWithMessages();
  };

  // ── Color theming ────────────────────────────────────────────────────────

  const decorationEmitter = new vscode.EventEmitter<undefined>();
  context.subscriptions.push(
    decorationEmitter,
    vscode.window.registerFileDecorationProvider({
      onDidChangeFileDecorations: decorationEmitter.event,
      provideFileDecoration(uri) {
        if (uri.scheme !== "dualexplorer") {
          return undefined;
        }
        const key: ExplorerKey = uri.authority === "a" ? "A" : "B";
        if (!providers[key].getForegroundColor()) {
          return undefined;
        }
        const colorId = key === "A" ? "dualExplorer.explorerAForeground" : "dualExplorer.explorerBForeground";
        return { color: new vscode.ThemeColor(colorId) };
      }
    })
  );

  const updateColorCustomization = async (key: string, value: string | undefined): Promise<void> => {
    const workbench = vscode.workspace.getConfiguration("workbench");
    const existing = workbench.get<Record<string, string>>("colorCustomizations") ?? {};
    if (value === undefined) {
      const { [key]: _removed, ...rest } = existing;
      await workbench.update("colorCustomizations", Object.keys(rest).length ? rest : undefined, vscode.ConfigurationTarget.Global);
    } else {
      await workbench.update("colorCustomizations", { ...existing, [key]: value }, vscode.ConfigurationTarget.Global);
    }
  };

  const pickHexColor = async (prompt: string, current: string): Promise<string | undefined> => {
    const value = await vscode.window.showInputBox({
      prompt,
      value: current || "#",
      placeHolder: "#rrggbb",
      ignoreFocusOut: true,
      validateInput: (v) => /^#[0-9a-fA-F]{6}$/.test(v.trim()) ? undefined : "Enter a 6-digit hex color, e.g. #d4e8c2"
    });
    return value?.trim();
  };

  const setForegroundColor = async (key: ExplorerKey): Promise<void> => {
    const colorId = key === "A" ? "dualExplorer.explorerAForeground" : "dualExplorer.explorerBForeground";
    const hex = await pickHexColor(`Item text color for Explorer ${key}`, providers[key].getForegroundColor());
    if (!hex) return;
    providers[key].setForegroundColor(hex);
    await updateColorCustomization(colorId, hex);
    decorationEmitter.fire(undefined);
    refreshWithMessages();
  };

  const clearForegroundColor = async (key: ExplorerKey): Promise<void> => {
    const colorId = key === "A" ? "dualExplorer.explorerAForeground" : "dualExplorer.explorerBForeground";
    providers[key].clearForegroundColor();
    await updateColorCustomization(colorId, undefined);
    decorationEmitter.fire(undefined);
    refreshWithMessages();
  };

  const revealCurrent = async (key: ExplorerKey): Promise<void> => {
    const view = key === "A" ? viewA : viewB;
    await providers[key].revealCurrentFile(view);
  };

  const activeContext = (item?: ExplorerItem): { provider: DualExplorerProvider; view: vscode.TreeView<ExplorerItem> } => {
    if (item) {
      if (item.explorerKey === "A") {
        return { provider: providers.A, view: viewA };
      }

      if (item.explorerKey === "B") {
        return { provider: providers.B, view: viewB };
      }

      if (providers.A.getRootUri() && item.uri.fsPath.startsWith(providers.A.getRootUri()!.fsPath)) {
        return { provider: providers.A, view: viewA };
      }

      if (providers.B.getRootUri() && item.uri.fsPath.startsWith(providers.B.getRootUri()!.fsPath)) {
        return { provider: providers.B, view: viewB };
      }
    }

    return viewA.visible ? { provider: providers.A, view: viewA } : { provider: providers.B, view: viewB };
  };

  context.subscriptions.push(
    viewA.onDidChangeVisibility(() => {
      if (viewA.visible) {
        void providers.A.restoreLastSelection(viewA);
      }
    }),
    viewB.onDidChangeVisibility(() => {
      if (viewB.visible) {
        void providers.B.restoreLastSelection(viewB);
      }
    }),
    providers.A,
    providers.B,
    viewA,
    viewB,
    vscode.commands.registerCommand("dualExplorer.selectRootA", () => selectRoot("A")),
    vscode.commands.registerCommand("dualExplorer.selectRootB", () => selectRoot("B")),
    vscode.commands.registerCommand("dualExplorer.removeRootA", () => removeRoot("A")),
    vscode.commands.registerCommand("dualExplorer.removeRootB", () => removeRoot("B")),
    vscode.commands.registerCommand("dualExplorer.refreshA", () => {
      providers.A.refresh();
      setViewMessages();
    }),
    vscode.commands.registerCommand("dualExplorer.refreshB", () => {
      providers.B.refresh();
      setViewMessages();
    }),
    vscode.commands.registerCommand("dualExplorer.refreshAll", refreshWithMessages),
    vscode.commands.registerCommand("dualExplorer.setFilterA", () => setFilter("A")),
    vscode.commands.registerCommand("dualExplorer.setFilterB", () => setFilter("B")),
    vscode.commands.registerCommand("dualExplorer.clearFilterA", () => clearFilter("A")),
    vscode.commands.registerCommand("dualExplorer.clearFilterB", () => clearFilter("B")),
    vscode.commands.registerCommand("dualExplorer.setTopLevelDirRegexA", () => setTopLevelDirRegex("A")),
    vscode.commands.registerCommand("dualExplorer.setTopLevelDirRegexB", () => setTopLevelDirRegex("B")),
    vscode.commands.registerCommand("dualExplorer.clearTopLevelDirRegexA", () => clearTopLevelDirRegex("A")),
    vscode.commands.registerCommand("dualExplorer.clearTopLevelDirRegexB", () => clearTopLevelDirRegex("B")),
    vscode.commands.registerCommand("dualExplorer.setTopLevelDirListA", () => setTopLevelDirList("A")),
    vscode.commands.registerCommand("dualExplorer.setTopLevelDirListB", () => setTopLevelDirList("B")),
    vscode.commands.registerCommand("dualExplorer.clearTopLevelDirListA", () => clearTopLevelDirList("A")),
    vscode.commands.registerCommand("dualExplorer.clearTopLevelDirListB", () => clearTopLevelDirList("B")),
    vscode.commands.registerCommand("dualExplorer.setFilterListA", () => setFilterList("A")),
    vscode.commands.registerCommand("dualExplorer.setFilterListB", () => setFilterList("B")),
    vscode.commands.registerCommand("dualExplorer.clearFilterListA", () => clearFilterList("A")),
    vscode.commands.registerCommand("dualExplorer.clearFilterListB", () => clearFilterList("B")),
    vscode.commands.registerCommand("dualExplorer.collapseAllA", () => collapseAll("A")),
    vscode.commands.registerCommand("dualExplorer.collapseAllB", () => collapseAll("B")),
    vscode.commands.registerCommand("dualExplorer.expandAllA", () => expandAll("A")),
    vscode.commands.registerCommand("dualExplorer.expandAllB", () => expandAll("B")),
    vscode.commands.registerCommand("dualExplorer.setForegroundColorA", () => setForegroundColor("A")),
    vscode.commands.registerCommand("dualExplorer.setForegroundColorB", () => setForegroundColor("B")),
    vscode.commands.registerCommand("dualExplorer.clearForegroundColorA", () => clearForegroundColor("A")),
    vscode.commands.registerCommand("dualExplorer.clearForegroundColorB", () => clearForegroundColor("B")),
    vscode.commands.registerCommand("dualExplorer.revealCurrentFileA", () => revealCurrent("A")),
    vscode.commands.registerCommand("dualExplorer.revealCurrentFileB", () => revealCurrent("B")),
    vscode.commands.registerCommand("dualExplorer.open", async (item: ExplorerItem) => {
      const { provider } = activeContext(item);
      await provider.open(item);
    }),
    vscode.commands.registerCommand("dualExplorer.newFile", async (item?: ExplorerItem) => {
      const { provider } = activeContext(item);
      await provider.createChild(item, "file");
    }),
    vscode.commands.registerCommand("dualExplorer.newFolder", async (item?: ExplorerItem) => {
      const { provider } = activeContext(item);
      await provider.createChild(item, "folder");
    }),
    vscode.commands.registerCommand("dualExplorer.rename", async (item: ExplorerItem) => {
      const { provider } = activeContext(item);
      await provider.rename(item);
    }),
    vscode.commands.registerCommand("dualExplorer.delete", async (item?: ExplorerItem) => {
      const { provider, view } = activeContext(item);
      const items = provider.getSelectedItemsFromView(view, item);
      await provider.delete(items);
    }),
    vscode.commands.registerCommand("dualExplorer.copyPath", async (item: ExplorerItem) => {
      const { provider } = activeContext(item);
      await provider.copyPath(item);
    }),
    vscode.commands.registerCommand("dualExplorer.revealInOS", async (item: ExplorerItem) => {
      const { provider } = activeContext(item);
      await provider.revealInOS(item);
    }),
    vscode.commands.registerCommand("dualExplorer.openTerminalHere", async (item?: ExplorerItem) => {
      const { provider } = activeContext(item);
      await provider.openTerminalHere(item);
    })
  );

  context.subscriptions.push(
    vscode.workspace.onDidChangeConfiguration((e) => {
      if (e.affectsConfiguration("dualExplorer.filter.caseSensitive")) {
        refreshWithMessages();
      }
    })
  );

  if (viewA.visible) {
    void providers.A.restoreLastSelection(viewA);
  }

  if (viewB.visible) {
    void providers.B.restoreLastSelection(viewB);
  }
}

export function deactivate(): void {
  // No-op
}
