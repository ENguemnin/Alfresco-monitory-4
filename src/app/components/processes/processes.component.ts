import { Component, OnInit, OnDestroy, ViewChild } from "@angular/core";
import { MatTableDataSource } from "@angular/material/table";
import { MatPaginator } from "@angular/material/paginator";
import { MatSort } from "@angular/material/sort";
import { MatTabChangeEvent } from "@angular/material/tabs";
import { DatePipe, CommonModule } from "@angular/common";
import { FormsModule } from "@angular/forms";
import { Subscription } from "rxjs";
import { SelectionModel } from "@angular/cdk/collections";

import {
  ProcessData,
  ProcessResponse,
  ProcessService,
} from "../../core/services/process.service";
import { TaskService } from "../../core/services/task.service";
import { ToastService, ToastMessage } from "../../core/services/toast.service";
import { Task, TaskAssignment } from "../../core/models/task.model";

// Angular Material modules
import { MatTableModule } from "@angular/material/table";
import { MatPaginatorModule } from "@angular/material/paginator";
import { MatSortModule } from "@angular/material/sort";
import { MatFormFieldModule } from "@angular/material/form-field";
import { MatInputModule } from "@angular/material/input";
import { MatIconModule } from "@angular/material/icon";
import { MatButtonModule } from "@angular/material/button";
import { MatTabsModule } from "@angular/material/tabs";
import { MatTooltipModule } from "@angular/material/tooltip";
import { MatCheckboxModule } from "@angular/material/checkbox";
import { MatMenuModule } from "@angular/material/menu";

// Shared components
import { TaskActionsComponent } from "../../shared/components/task-actions/task-actions.component";
import { TaskTransferModalComponent } from "../../shared/components/task-transfer-modal/task-transfer-modal.component";
import { ToastNotificationComponent } from "../../shared/components/toast-notification/toast-notification.component";
import { ConfirmDialogComponent } from "../../shared/components/confirm-dialog/confirm-dialog.component";
import { TasksService } from "../../core/services/tasks.service";
import { BulkActionsModalComponent } from "../../shared/components/bulk-actions-modal/bulk-actions-modal.component";

@Component({
  selector: "app-processes",
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    MatTableModule,
    MatPaginatorModule,
    MatSortModule,
    MatFormFieldModule,
    MatInputModule,
    MatIconModule,
    MatButtonModule,
    MatTabsModule,
    MatTooltipModule,
    MatCheckboxModule,
    MatMenuModule,
    TaskActionsComponent,
    TaskTransferModalComponent,
    ToastNotificationComponent,
    ConfirmDialogComponent,
    BulkActionsModalComponent,
  ],
  templateUrl: "./processes.component.html",
  styleUrls: ["./processes.component.scss"],
  providers: [DatePipe],
})
export class ProcessesComponent implements OnInit, OnDestroy {
  // Make Math available for template
  Math = Math;

  // Existing properties
  activeTabIndex = 0;
  loading = true;
  tabs = [
    {
      label: "Uniquement par son initiateur",
      key: "processusInitiateurSeulement",
      count: 0,
    },
    { label: "Qu'une seule tâche exécutée", key: "processusLongs", count: 0 },
    {
      label: "Avec erreur/exception technique",
      key: "processusSansTâches",
      count: 0,
    },
    {
      label: "Sans aucune tâche utilisateur",
      key: "nombreProcessusÉchoués",
      count: 0,
    },
  ];

  displayedColumns = [
    "select",
    "processInstanceId",
    "processDefinitionId",
    "processStartTime",
    "processInitiator",
    "actions",
  ];

  processData: ProcessResponse | null = null;
  selection = new SelectionModel<ProcessData>(true, []);

  // Data source properties
  filteredData: ProcessData[] = []; // Holds filtered data
  paginatedData: ProcessData[] = []; // Holds data for current page
  originalDataSource: ProcessData[] = []; // Original unfiltered data

  // Pagination properties
  currentPage: number = 1;
  pageSize: number = 5;
  totalPages: number = 1;
  visiblePageNumbers: number[] = [];

  // Sorting properties
  sortColumn: string = "";
  sortDirection: "asc" | "desc" = "asc";

  // Other properties
  private selectedProcessIds = new Set<string>();
  bulkActions = [
    { name: "Suspend Selected", action: "suspend", icon: "pause_circle" },
    { name: "Resume Selected", action: "resume", icon: "play_circle" },
    { name: "Terminate Selected", action: "terminate", icon: "stop_circle" },
    { name: "Transfer Selected", action: "transfer", icon: "swap_horiz" },
  ];

  showTransferModal = false;
  selectedTaskForTransfer: Task[] = [];
  toasts: ToastMessage[] = [];

  showBulkConfirmDialog = false;
  bulkConfirmDialogConfig = {
    title: "",
    message: "",
    confirmText: "",
    cancelText: "Annuler",
    icon: "",
    iconColor: "",
    theme: "",
    action: "" as "suspend" | "resume" | "terminate" | "",
    processes: [] as ProcessData[],
  };

  showBulkActionsModal = false;

  private socketSubscription!: Subscription;
  private toastSubscription!: Subscription;
  private transferQueue: ProcessData[] = [];
  private isAutoTransfer = false;
  currentSearchValue: string = "";

  // Add state persistence properties
  private uiState: {
    currentPage: number;
    pageSize: number;
    sortColumn: string;
    sortDirection: "asc" | "desc";
    searchValue: string;
    activeTabIndex: number;
  } = {
    currentPage: 1,
    pageSize: 5,
    sortColumn: "",
    sortDirection: "asc",
    searchValue: "",
    activeTabIndex: 0,
  };

  @ViewChild(MatPaginator) paginator!: MatPaginator;
  @ViewChild(MatSort) sort!: MatSort;
  dataSource: any;

  constructor(
    private webSocketService: ProcessService,
    private taskService: TaskService,
    private tasksService: TasksService,
    private toastService: ToastService,
    private datePipe: DatePipe
  ) {}

  ngOnInit(): void {
    // Load saved state from localStorage if available
    this.loadSavedState();

    // Apply saved values to current state
    this.currentPage = this.uiState.currentPage;
    this.pageSize = this.uiState.pageSize;
    this.sortColumn = this.uiState.sortColumn;
    this.sortDirection = this.uiState.sortDirection;
    this.currentSearchValue = this.uiState.searchValue;
    this.activeTabIndex = this.uiState.activeTabIndex;

    // Initialize the dataSource with an empty array
    this.dataSource = new MatTableDataSource<ProcessData>([]);

    this.loading = true;
    this.subscribeToToasts();
    // Add realistic loading delay to showcase skeleton
    setTimeout(() => this.connectToWebSocket(), 1500);
  }

  ngOnDestroy(): void {
    // Save state before component destruction
    this.saveCurrentState();

    this.socketSubscription?.unsubscribe();
    this.toastSubscription?.unsubscribe();
    this.webSocketService.close();
  }

  // Add methods to save and load state
  private saveCurrentState(): void {
    // Update state object with current values
    this.uiState = {
      currentPage: this.currentPage,
      pageSize: this.pageSize,
      sortColumn: this.sortColumn,
      sortDirection: this.sortDirection,
      searchValue: this.currentSearchValue,
      activeTabIndex: this.activeTabIndex,
    };

    // Save to localStorage
    localStorage.setItem(
      "processesComponentState",
      JSON.stringify(this.uiState)
    );
  }

  private loadSavedState(): void {
    const savedState = localStorage.getItem("processesComponentState");
    if (savedState) {
      try {
        this.uiState = JSON.parse(savedState);
      } catch (e) {
        console.warn("Failed to parse saved state", e);
      }
    }
  }

  // Pagination methods
  updatePagination(): void {
    // Ensure pageSize is valid
    if (!this.pageSize || this.pageSize < 1) {
      this.pageSize = 5;
    }

    // Calculate total pages
    this.totalPages = Math.max(
      1,
      Math.ceil(this.filteredData.length / this.pageSize)
    );

    // Ensure current page is valid
    if (this.currentPage > this.totalPages) {
      this.currentPage = this.totalPages;
    }
    if (this.currentPage < 1) {
      this.currentPage = 1;
    }

    // Get data for current page
    const startIndex = (this.currentPage - 1) * this.pageSize;
    const endIndex = Math.min(
      startIndex + this.pageSize,
      this.filteredData.length
    );
    this.paginatedData = this.filteredData.slice(startIndex, endIndex);

    // Calculate visible page numbers
    this.calculateVisiblePageNumbers();
  }

  calculateVisiblePageNumbers(): void {
    this.visiblePageNumbers = [];

    if (this.totalPages <= 7) {
      // Show all pages if 7 or fewer
      for (let i = 1; i <= this.totalPages; i++) {
        this.visiblePageNumbers.push(i);
      }
    } else {
      // Complex logic for many pages
      if (this.currentPage <= 4) {
        // Beginning: 1 2 3 4 5 ... last
        for (let i = 1; i <= 5; i++) {
          this.visiblePageNumbers.push(i);
        }
        this.visiblePageNumbers.push(-1); // ellipsis
        this.visiblePageNumbers.push(this.totalPages);
      } else if (this.currentPage >= this.totalPages - 3) {
        // End: 1 ... total-4 total-3 total-2 total-1 total
        this.visiblePageNumbers.push(1);
        this.visiblePageNumbers.push(-1); // ellipsis
        for (let i = this.totalPages - 4; i <= this.totalPages; i++) {
          this.visiblePageNumbers.push(i);
        }
      } else {
        // Middle: 1 ... current-1 current current+1 ... last
        this.visiblePageNumbers.push(1);
        this.visiblePageNumbers.push(-1); // ellipsis
        for (let i = this.currentPage - 1; i <= this.currentPage + 1; i++) {
          this.visiblePageNumbers.push(i);
        }
        this.visiblePageNumbers.push(-1); // ellipsis
        this.visiblePageNumbers.push(this.totalPages);
      }
    }
  }

  nextPage(): void {
    if (this.currentPage < this.totalPages) {
      this.currentPage++;
      this.updatePagination();
      this.saveCurrentState();
    }
  }

  previousPage(): void {
    if (this.currentPage > 1) {
      this.currentPage--;
      this.updatePagination();
      this.saveCurrentState();
    }
  }

  goToPage(page: number): void {
    if (page >= 1 && page <= this.totalPages && page !== this.currentPage) {
      this.currentPage = page;
      this.updatePagination();
      this.saveCurrentState();
    }
  }

  onPageSizeChange(): void {
    // Remember the first item on the current page
    const firstItemIndex = (this.currentPage - 1) * this.pageSize;

    // Calculate which page will contain this item with the new page size
    this.currentPage = Math.floor(firstItemIndex / this.pageSize) + 1;

    // Update pagination
    this.updatePagination();
    this.saveCurrentState();
  }

  // Table sorting methods
  sortData(column: string): void {
    if (this.sortColumn === column) {
      // Toggle direction
      this.sortDirection = this.sortDirection === "asc" ? "desc" : "asc";
    } else {
      this.sortColumn = column;
      this.sortDirection = "asc";
    }

    // Apply sorting
    this.filteredData.sort((a: any, b: any) => {
      const valueA = a[column] || "";
      const valueB = b[column] || "";

      let comparison = 0;
      if (typeof valueA === "string" && typeof valueB === "string") {
        comparison = valueA.localeCompare(valueB);
      } else {
        comparison = valueA - valueB;
      }

      return this.sortDirection === "asc" ? comparison : -comparison;
    });

    this.updatePagination();
    this.saveCurrentState();
  }

  // Selection methods
  isAllSelected(): boolean {
    return (
      this.filteredData.length > 0 &&
      this.selection.selected.length === this.filteredData.length
    );
  }

  toggleAllRows(): void {
    if (this.isAllSelected()) {
      this.selection.clear();
      this.selectedProcessIds.clear();
    } else {
      // Select all items in the filtered data (current view)
      this.filteredData.forEach((row) => {
        this.selection.select(row);
        this.selectedProcessIds.add(row.processInstanceId);
      });
    }
  }

  toggleSelection(row: ProcessData): void {
    this.selection.toggle(row);

    if (this.selection.isSelected(row)) {
      this.selectedProcessIds.add(row.processInstanceId);
    } else {
      this.selectedProcessIds.delete(row.processInstanceId);
    }
  }

  // Data loading methods
  connectToWebSocket(): void {
    // Save current state before reconnecting
    if (!this.loading) {
      this.saveCurrentState();
    }

    if (this.socketSubscription) {
      this.socketSubscription.unsubscribe();
    }
    this.socketSubscription = this.webSocketService.connect().subscribe({
      next: (response: ProcessResponse) => {
        this.processData = response;
        this.updateTabCounts();
        this.loadTabData(this.activeTabIndex);

        // Add smooth transition from skeleton to content
        setTimeout(() => {
          this.loading = false;
        }, 800);
      },
      error: (err) => {
        console.error("WebSocket error:", err);
        this.loading = false;
        setTimeout(() => this.connectToWebSocket(), 5000);
      },
      complete: () => {
        console.warn("WebSocket connection closed. Reconnecting...");
        setTimeout(() => this.connectToWebSocket(), 5000);
      },
    });
  }

  refreshData(): void {
    // Save current state before refreshing
    this.saveCurrentState();

    this.loading = true;
    this.selection.clear();
    this.selectedProcessIds.clear();

    // Add realistic loading delay
    setTimeout(() => this.connectToWebSocket(), 1200);
  }

  updateTabCounts(): void {
    if (!this.processData) return;
    this.tabs[0].count =
      this.processData.processusInitiateurSeulement?.nombre || 0;
    this.tabs[1].count = this.processData.processusLongs?.nombre || 0;
    this.tabs[2].count = this.processData.processusSansTâches?.nombre || 0;
    this.tabs[3].count = this.processData.ProcessusÉchoués?.nombre || 0;
  }

  onTabChange(event: MatTabChangeEvent): void {
    this.activeTabIndex = event.index;
    this.selection.clear();
    this.selectedProcessIds.clear();
    this.loadTabData(event.index);

    // Save state when tab changes
    this.saveCurrentState();
  }

  loadTabData(tabIndex: number): void {
    if (!this.processData) return;

    let processes: ProcessData[] = [];
    switch (tabIndex) {
      case 0:
        processes =
          this.processData.processusInitiateurSeulement?.processus || [];
        break;
      case 1:
        processes = this.processData.processusLongs?.processus || [];
        break;
      case 2:
        processes = this.processData.processusSansTâches?.processus || [];
        break;
      case 3:
        processes = this.processData.ProcessusÉchoués?.processus || [];
        break;
    }

    this.originalDataSource = [...processes];
    this.filteredData = [...processes];

    // Update MatTableDataSource with filtered data
    this.dataSource = new MatTableDataSource<ProcessData>(this.filteredData);

    // Apply sorting and pagination
    if (this.sort) {
      this.dataSource.sort = this.sort;
    }
    if (this.paginator) {
      this.dataSource.paginator = this.paginator;
    }

    // Restore selections
    this.restoreSelections();

    // Apply search filter if one exists
    if (this.currentSearchValue) {
      this.applyFilter(this.currentSearchValue);
    }

    // Apply sorting if a column is selected
    if (this.sortColumn) {
      this.sortData(this.sortColumn);
    }

    // Ensure current page is valid for the new data
    const maxPage = Math.max(
      1,
      Math.ceil(this.filteredData.length / this.pageSize)
    );
    this.currentPage = Math.min(this.currentPage, maxPage);

    // Update pagination with preserved values
    this.updatePagination();
  }

  getRowClass(row: ProcessData) {
    return { selected: this.selection.isSelected(row) };
  }

  subscribeToToasts(): void {
    this.toastSubscription = this.toastService.toasts$.subscribe((toasts) => {
      this.toasts = toasts;
    });
  }

  ngAfterViewInit(): void {
    // Only assign paginator and sort if dataSource is initialized
    if (this.dataSource && this.paginator) {
      this.dataSource.paginator = this.paginator;
    }
    if (this.dataSource && this.sort) {
      this.dataSource.sort = this.sort;
    }
  }

  ngAfterViewChecked(): void {
    // Check if dataSource exists before trying to access its properties
    if (!this.dataSource) return;

    // Always re-assign paginator and sort after view checked to ensure it is set
    if (this.paginator && this.dataSource.paginator !== this.paginator) {
      this.dataSource.paginator = this.paginator;
    }
    if (this.sort && this.dataSource.sort !== this.sort) {
      this.dataSource.sort = this.sort;
    }
  }

  performBulkAction(action: string) {
    const selectedProcesses = this.selection.selected;
    if (!selectedProcesses.length) {
      this.toastService.warning(
        "No Selection",
        "Please select at least one process"
      );
      return;
    }

    // Afficher le popup de confirmation pour les actions groupées
    let title = "";
    let message = "";
    let confirmText = "";
    let icon = "";
    let iconColor = "";
    let theme = "";

    switch (action) {
      case "suspend":
        title = "Confirmation de suspension groupée";
        message = `Êtes-vous sûr de vouloir suspendre ${selectedProcesses.length} processus sélectionnés ?`;
        confirmText = "Suspendre";
        icon = "pause_circle";
        iconColor = "#f59e42";
        theme = "";
        break;
      case "resume":
        title = "Confirmation de reprise groupée";
        message = `Êtes-vous sûr de vouloir reprendre ${selectedProcesses.length} processus sélectionnés ?`;
        confirmText = "Reprendre";
        icon = "play_circle";
        iconColor = "#4caf50";
        theme = "";
        break;
      case "terminate":
        title = "Confirmation d'arrêt groupé";
        message = `Êtes-vous sûr de vouloir arrêter ${selectedProcesses.length} processus sélectionnés ?`;
        confirmText = "Arrêter";
        icon = "stop_circle";
        iconColor = "#ef4444";
        theme = "danger";
        break;
      case "transfer":
        // Pas de confirmation pour transfert, ouvrir directement le modal
        this.selectedTaskForTransfer = selectedProcesses.map(
          this.mapProcessToTask
        );
        this.showTransferModal = true;
        return;
    }

    this.bulkConfirmDialogConfig = {
      title,
      message,
      confirmText,
      cancelText: "Annuler",
      icon,
      iconColor,
      theme,
      action: action as "suspend" | "resume" | "terminate",
      processes: [...selectedProcesses],
    };
    this.showBulkConfirmDialog = true;
  }

  onBulkConfirmDialogResult(result: boolean) {
    if (!result) {
      this.showBulkConfirmDialog = false;
      return;
    }
    const { action, processes } = this.bulkConfirmDialogConfig;
    if (!processes.length) return;

    switch (action) {
      case "suspend":
        processes.forEach((p) =>
          this.onToggleProcessSuspension(p.processInstanceId, false)
        );
        break;
      case "resume":
        processes.forEach((p) =>
          this.onToggleProcessSuspension(p.processInstanceId, true)
        );
        break;
      case "terminate":
        processes.forEach((p) => this.onTerminateProcess(p.processInstanceId));
        break;
    }
    this.selection.clear();
    this.selectedProcessIds.clear();
    this.showBulkConfirmDialog = false;
  }

  mapProcessToTask(process: ProcessData): Task {
    return {
      id: process.taskId ?? `TASK-${process.processInstanceId}`,
      processInstanceId: process.processInstanceId,
      processDefinitionId: process.processDefinitionId,
      name: `Tâche pour ${process.processDefinitionId}`,
      description: `Tâche liée au processus ${process.processInstanceId}`,
      assignee: process.processInitiator,
      created: new Date(process.processStartTime),
      priority: 50,
      status: "assigned",
      managerId: process.managerId || null,
      managerEmail: process.managerEmail || null,
      groupName: process.groupName || null,
      groupId: process.groupId || null,
    };
  }

  processNextTransfer(): void {
    if (!this.transferQueue.length) {
      this.showTransferModal = false;
      this.selectedTaskForTransfer = [];
      this.isAutoTransfer = false;
      this.selection.clear();
      this.refreshData();
      return;
    }

    const next = this.transferQueue.shift();
    if (next) {
      this.selectedTaskForTransfer = [this.mapProcessToTask(next)];
      this.showTransferModal = true;
    }
  }

  async transferProcessesSequentially(processes: ProcessData[]) {
    if (!processes.length) return;

    const nextProcess = processes.shift();
    if (!nextProcess) return;

    return new Promise<void>((resolve) => {
      const task = this.mapProcessToTask(nextProcess);
      this.selectedTaskForTransfer = [task];
      this.showTransferModal = true;

      const subscription = this.toastService.toasts$.subscribe((toasts) => {
        const transferSuccess = toasts.find(
          (t) =>
            t.title?.includes("Tâche transférée") &&
            t.message?.includes(task.id)
        );
        if (transferSuccess) {
          subscription.unsubscribe();
          this.showTransferModal = false;
          this.selectedTaskForTransfer = [];
          setTimeout(() => this.transferProcessesSequentially(processes), 500);
          resolve();
        }
      });
    });
  }

  onToggleProcessSuspension(processId: string, isSuspended: boolean): void {
    // Find the process in filteredData (instead of dataSource.data)
    const process = this.filteredData.find(
      (p) => p.processInstanceId === processId
    );

    if (!process) {
      this.toastService.error("Erreur", `Processus ${processId} non trouvé.`);
      return;
    }

    const originalInitiatorId = process.processInitiatorId || "";

    const action$ = isSuspended
      ? this.tasksService.ResumeProcess(processId, originalInitiatorId)
      : this.tasksService.SuspendProcess(processId, originalInitiatorId);

    action$.subscribe({
      next: (success: boolean) => {
        const actionText = isSuspended ? "repris" : "suspendu";
        if (success) {
          this.toastService.success(
            `Processus ${actionText}`,
            `Le processus ${processId} a été ${actionText}.`
          );
          this.refreshData();
        } else {
          this.toastService.error(
            "Erreur",
            `Échec de la ${
              isSuspended ? "reprise" : "suspension"
            } du processus ${processId}.`
          );
        }
      },
      error: () => {
        const actionText = isSuspended ? "reprendre" : "suspendre";
        this.toastService.error(
          "Erreur",
          `Impossible de ${actionText} le processus ${processId}.`
        );
      },
    });
  }

  onTerminateProcess(processId: string): void {
    // Find the process in filteredData to get the original initiator ID
    const process = this.filteredData.find(
        (p) => p.processInstanceId === processId
    );

    if (!process) {
      this.toastService.error("Erreur", `Processus ${processId} non trouvé.`);
      return;
    }

    const originalInitiatorId = process.processInitiatorId || "";

    this.tasksService.TerminateProcess(processId, originalInitiatorId).subscribe({
      next: (success) => {
        if (success) {
          this.toastService.success(
              "Processus terminé",
              `Le processus ${processId} a été terminé avec succès.`
          );
          this.refreshData();
        } else {
          this.toastService.error(
              "Erreur",
              `Échec de la terminaison du processus ${processId}.`
          );
        }
      },
      error: () => {
        this.toastService.error(
            "Erreur",
            `Impossible de terminer le processus ${processId}.`
        );
      },
    });
  }

  onTransferTask(processData: ProcessData): void {
    this.selectedTaskForTransfer = [this.mapProcessToTask(processData)];
    this.showTransferModal = true;
  }

  onCloseTransferModal(): void {
    this.showTransferModal = false;
    this.selectedTaskForTransfer = [];

    if (this.isAutoTransfer) {
      this.isAutoTransfer = false;
      this.transferQueue = [];
      this.selection.clear();
    }
  }

  onTaskTransferred(assignment: TaskAssignment | TaskAssignment[]): void {
    const assignments = Array.isArray(assignment) ? assignment : [assignment];

    for (const a of assignments) {
      const assignee = a.assigneeId || a.assigneeType;
      this.toastService.success(
        "Tâche transférée",
        `La tâche ${a.taskId} a été transférée à ${assignee}.`
      );
    }

    if (this.isAutoTransfer) {
      this.showTransferModal = false;
      this.selectedTaskForTransfer = [];
      setTimeout(() => this.processNextTransfer(), 500);
    } else {
      this.refreshData();
    }
  }

  removeToast(id: string): void {
    this.toastService.remove(id);
  }

  getStatusClass(status: string): string {
    switch (status?.toLowerCase()) {
      case "failed":
      case "error":
        return "badge-error";
      case "warning":
        return "badge-warning";
      case "success":
      case "completed":
        return "badge-success";
      default:
        return "badge-info";
    }
  }

  // Explicitly declare all methods used in the template with proper types
  applyFilter(value: string): void {
    this.currentSearchValue = value.trim().toLowerCase();

    if (!this.currentSearchValue) {
      this.filteredData = [...this.originalDataSource];
    } else {
      this.filteredData = this.originalDataSource.filter(
        (process) =>
          process.processInstanceId
            ?.toLowerCase()
            .includes(this.currentSearchValue) ||
          process.processDefinitionId
            ?.toLowerCase()
            .includes(this.currentSearchValue) ||
          process.processInitiator
            ?.toLowerCase()
            .includes(this.currentSearchValue)
      );
    }

    // Reset to first page and update pagination
    this.currentPage = 1;
    this.updatePagination();
    this.saveCurrentState();
  }

  clearSearch(): void {
    this.currentSearchValue = "";
    this.filteredData = [...this.originalDataSource];
    this.currentPage = 1;
    this.updatePagination();
    this.saveCurrentState();
  }

  formatDate(dateString: string): string {
    return this.datePipe.transform(dateString, "medium") || "";
  }

  // Make sure this is properly declared in the class
  private restoreSelections(): void {
    if (this.selectedProcessIds.size === 0) return;

    const processesToSelect = this.filteredData.filter((process) =>
      this.selectedProcessIds.has(process.processInstanceId)
    );

    this.selection.clear();
    this.selection.select(...processesToSelect);
  }
}
   