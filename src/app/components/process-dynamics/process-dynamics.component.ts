import { Component, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Subject, debounceTime, distinctUntilChanged, takeUntil } from 'rxjs';

// Components
import { TaskTransferModalComponent } from '../../shared/components/task-transfer-modal/task-transfer-modal.component';
import { BulkActionsModalComponent } from '../../shared/components/bulk-actions-modal/bulk-actions-modal.component';
import { ConfirmDialogComponent } from '../../shared/components/confirm-dialog/confirm-dialog.component';
import { ToastNotificationComponent } from '../../shared/components/toast-notification/toast-notification.component';

// Models and Services
import { Task, TaskAssignment } from '../../core/models/task.model';
import { ToastService } from '../../core/services/toast.service';

// Interfaces
interface ProcessItem {
  id: string;
  name: string;
  description: string;
  type: string;
  category: string;
}

interface TaskItem {
  id: string;
  name: string;
  description: string;
  status: 'active' | 'suspended' | 'completed' | 'failed' | 'pending';
  activeInstances: number;
  processId: string;
}

interface ResultItem {
  id: string;
  instanceId: string;
  definition: string;
  definitionDescription: string;
  startTime: Date;
  initiator: string;
  status: 'active' | 'suspended' | 'completed' | 'failed' | 'pending';
  type: string;
}

interface StatusOption {
  value: string;
  label: string;
}

interface Toast {
  id: string;
  title: string;
  message: string;
  type: 'success' | 'error' | 'warning' | 'info';
  duration?: number;
}

@Component({
  selector: 'app-process-dynamics',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    TaskTransferModalComponent,
    BulkActionsModalComponent,
    ConfirmDialogComponent,
    ToastNotificationComponent
  ],
  templateUrl: './process-dynamics.component.html',
  styleUrls: ['./process-dynamics.component.scss']
})
export class ProcessDynamicsComponent implements OnInit, OnDestroy {
  // Expose Math for template
  Math = Math;
  
  private destroy$ = new Subject<void>();
  private processSearchSubject = new Subject<string>();
  private taskSearchSubject = new Subject<string>();
  private globalSearchSubject = new Subject<string>();

  // ===== LOADING STATE =====
  loading = true;

  // ===== FILTER STATE =====
  filtersApplied = false;
  processSearchTerm = '';
  taskSearchTerm = '';
  globalSearchTerm = '';
  startDate = '';
  endDate = '';
  dateRangeError = '';
  applyingFilters = false;

  // ===== AUTOCOMPLETE STATE =====
  showProcessSuggestions = false;
  showTaskSuggestions = false;
  processSuggestions: ProcessItem[] = [];
  taskSuggestions: TaskItem[] = [];

  // ===== SELECTION STATE =====
  selectedProcess: ProcessItem | null = null;
  selectedTasks: TaskItem[] = [];
  selectedStatuses: string[] = [];
  selectedItems = new Set<string>();

  // ===== RESULTS STATE =====
  allResults: ResultItem[] = [];
  filteredResults: ResultItem[] = [];
  paginatedResults: ResultItem[] = [];

  // ===== PAGINATION STATE =====
  currentPage = 1;
  pageSize = 10;
  totalPages = 1;

  // ===== SORTING STATE =====
  sortField = '';
  sortDirection: 'asc' | 'desc' = 'asc';

  // ===== MODAL STATE =====
  showTransferModal = false;
  showBulkActionsModal = false;
  showConfirmDialog = false;
  taskToTransfer: Task | Task[] | null = null;
  confirmDialogConfig = {
    title: '',
    message: '',
    confirmText: 'Confirmer',
    cancelText: 'Annuler',
    icon: 'help_outline',
    iconColor: '#f59e0b',
    theme: ''
  };

  // ===== TOAST STATE =====
  toasts: Toast[] = [];

  // ===== MOCK DATA =====
  availableProcesses: ProcessItem[] = [
    {
      id: '1',
      name: 'Demande de Prêt Personnel',
      description: 'Processus de validation des demandes de prêt personnel',
      type: 'loan',
      category: 'Finance'
    },
    {
      id: '2',
      name: 'Ouverture de Compte',
      description: 'Processus d\'ouverture de nouveaux comptes bancaires',
      type: 'account',
      category: 'Banking'
    },
    {
      id: '3',
      name: 'Validation KYC',
      description: 'Processus de vérification Know Your Customer',
      type: 'kyc',
      category: 'Compliance'
    },
    {
      id: '4',
      name: 'Demande Carte Bancaire',
      description: 'Processus de demande et émission de cartes bancaires',
      type: 'card',
      category: 'Banking'
    },
    {
      id: '5',
      name: 'Évaluation Risque Crédit',
      description: 'Processus d\'évaluation des risques de crédit',
      type: 'risk',
      category: 'Risk Management'
    }
  ];

  availableTasks: TaskItem[] = [
    {
      id: '1',
      name: 'Vérification Documents',
      description: 'Vérifier les documents fournis par le client',
      status: 'active',
      activeInstances: 15,
      processId: '1'
    },
    {
      id: '2',
      name: 'Analyse Financière',
      description: 'Analyser la situation financière du demandeur',
      status: 'active',
      activeInstances: 8,
      processId: '1'
    },
    {
      id: '3',
      name: 'Validation Manager',
      description: 'Validation finale par le manager',
      status: 'pending',
      activeInstances: 3,
      processId: '1'
    },
    {
      id: '4',
      name: 'Saisie Informations Client',
      description: 'Saisir les informations du nouveau client',
      status: 'active',
      activeInstances: 12,
      processId: '2'
    },
    {
      id: '5',
      name: 'Vérification Identité',
      description: 'Vérifier l\'identité du client',
      status: 'active',
      activeInstances: 10,
      processId: '2'
    }
  ];

  availableStatuses: StatusOption[] = [
    { value: 'active', label: 'En cours' },
    { value: 'suspended', label: 'Suspendue' },
    { value: 'completed', label: 'Terminée' },
    { value: 'failed', label: 'Échec' },
    { value: 'pending', label: 'En attente' }
  ];

  constructor(private toastService: ToastService) {
    this.setupSearchDebouncing();
  }

  ngOnInit(): void {
    // Simulate initial loading
    setTimeout(() => {
      this.loading = false;
    }, 1500);
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  // ===== SETUP METHODS =====
  private setupSearchDebouncing(): void {
    this.processSearchSubject
      .pipe(debounceTime(300), distinctUntilChanged(), takeUntil(this.destroy$))
      .subscribe(term => {
        this.searchProcesses(term);
      });

    this.taskSearchSubject
      .pipe(debounceTime(300), distinctUntilChanged(), takeUntil(this.destroy$))
      .subscribe(term => {
        this.searchTasks(term);
      });

    this.globalSearchSubject
      .pipe(debounceTime(300), distinctUntilChanged(), takeUntil(this.destroy$))
      .subscribe(term => {
        this.performGlobalSearch(term);
      });
  }

  // ===== SEARCH METHODS =====
  onProcessSearch(): void {
    this.processSearchSubject.next(this.processSearchTerm);
  }

  onTaskSearch(): void {
    this.taskSearchSubject.next(this.taskSearchTerm);
  }

  onGlobalSearch(): void {
    this.globalSearchSubject.next(this.globalSearchTerm);
  }

  private searchProcesses(term: string): void {
    if (!term.trim()) {
      this.processSuggestions = [];
      return;
    }

    this.processSuggestions = this.availableProcesses
      .filter(process => 
        process.name.toLowerCase().includes(term.toLowerCase()) ||
        process.description.toLowerCase().includes(term.toLowerCase()) ||
        process.category.toLowerCase().includes(term.toLowerCase())
      )
      .slice(0, 10);
  }

  private searchTasks(term: string): void {
    if (!term.trim() || !this.selectedProcess) {
      this.taskSuggestions = [];
      return;
    }

    this.taskSuggestions = this.availableTasks
      .filter(task => 
        task.processId === this.selectedProcess!.id &&
        (task.name.toLowerCase().includes(term.toLowerCase()) ||
         task.description.toLowerCase().includes(term.toLowerCase()))
      )
      .slice(0, 10);
  }

  private performGlobalSearch(term: string): void {
    if (!term.trim()) {
      this.filteredResults = [...this.allResults];
    } else {
      this.filteredResults = this.allResults.filter(item =>
        item.instanceId.toLowerCase().includes(term.toLowerCase()) ||
        item.definition.toLowerCase().includes(term.toLowerCase()) ||
        item.initiator.toLowerCase().includes(term.toLowerCase())
      );
    }
    this.updatePagination();
  }

  // ===== SELECTION METHODS =====
  selectProcess(process: ProcessItem): void {
    this.selectedProcess = process;
    this.processSearchTerm = process.name;
    this.showProcessSuggestions = false;
    
    // Clear task selections when process changes
    this.selectedTasks = [];
    this.taskSearchTerm = '';
  }

  selectTask(task: TaskItem): void {
    if (!this.selectedTasks.find(t => t.id === task.id)) {
      this.selectedTasks.push(task);
    }
    this.taskSearchTerm = '';
    this.showTaskSuggestions = false;
  }

  removeSelectedTask(task: TaskItem): void {
    this.selectedTasks = this.selectedTasks.filter(t => t.id !== task.id);
  }

  clearSelectedTasks(): void {
    this.selectedTasks = [];
  }

  toggleStatus(status: string): void {
    const index = this.selectedStatuses.indexOf(status);
    if (index > -1) {
      this.selectedStatuses.splice(index, 1);
    } else {
      this.selectedStatuses.push(status);
    }
  }

  // ===== FILTER METHODS =====
  validateDateRange(): void {
    this.dateRangeError = '';
    
    if (this.startDate && this.endDate) {
      const start = new Date(this.startDate);
      const end = new Date(this.endDate);
      
      if (start >= end) {
        this.dateRangeError = 'La date de fin doit être postérieure à la date de début';
      }
    }
  }

  canApplyFilters(): boolean {
    return (this.selectedProcess || this.selectedTasks.length > 0 || 
            this.selectedStatuses.length > 0 || this.startDate || this.endDate) &&
           !this.dateRangeError;
  }

  hasActiveFilters(): boolean {
    return this.selectedProcess !== null || 
           this.selectedTasks.length > 0 || 
           this.selectedStatuses.length > 0 || 
           this.startDate !== '' || 
           this.endDate !== '';
  }

  applyFilters(): void {
    if (!this.canApplyFilters()) return;

    this.applyingFilters = true;

    // Simulate API call
    setTimeout(() => {
      this.generateMockResults();
      this.filtersApplied = true;
      this.applyingFilters = false;
      this.updatePagination();
      
      this.showToast('success', 'Filtres appliqués', 
        `${this.allResults.length} résultat(s) trouvé(s)`);
    }, 1000);
  }

  clearAllFilters(): void {
    this.selectedProcess = null;
    this.selectedTasks = [];
    this.selectedStatuses = [];
    this.startDate = '';
    this.endDate = '';
    this.processSearchTerm = '';
    this.taskSearchTerm = '';
    this.globalSearchTerm = '';
    this.dateRangeError = '';
    this.filtersApplied = false;
    this.allResults = [];
    this.filteredResults = [];
    this.paginatedResults = [];
    this.selectedItems.clear();
    
    this.showToast('info', 'Filtres effacés', 'Tous les filtres ont été réinitialisés');
  }

  removeProcessFilter(): void {
    this.selectedProcess = null;
    this.processSearchTerm = '';
    this.selectedTasks = [];
    this.taskSearchTerm = '';
  }

  clearDateRange(): void {
    this.startDate = '';
    this.endDate = '';
    this.dateRangeError = '';
  }

  formatDateRange(): string {
    if (this.startDate && this.endDate) {
      return `${this.formatDate(this.startDate)} - ${this.formatDate(this.endDate)}`;
    } else if (this.startDate) {
      return `Depuis ${this.formatDate(this.startDate)}`;
    } else if (this.endDate) {
      return `Jusqu'au ${this.formatDate(this.endDate)}`;
    }
    return '';
  }

  // ===== MOCK DATA GENERATION =====
  private generateMockResults(): void {
    const mockResults: ResultItem[] = [];
    const statuses: Array<'active' | 'suspended' | 'completed' | 'failed' | 'pending'> = 
      ['active', 'suspended', 'completed', 'failed', 'pending'];
    const initiators = ['Jean Dupont', 'Marie Martin', 'Pierre Durand', 'Sophie Legrand', 'Antoine Robert'];
    
    for (let i = 1; i <= 50; i++) {
      const randomStatus = statuses[Math.floor(Math.random() * statuses.length)];
      const randomInitiator = initiators[Math.floor(Math.random() * initiators.length)];
      const randomDaysAgo = Math.floor(Math.random() * 30);
      
      mockResults.push({
        id: `result-${i}`,
        instanceId: `INST-${2000 + i}`,
        definition: this.selectedProcess?.name || `Processus ${i}`,
        definitionDescription: this.selectedProcess?.description || `Description du processus ${i}`,
        startTime: new Date(Date.now() - randomDaysAgo * 24 * 60 * 60 * 1000),
        initiator: randomInitiator,
        status: randomStatus,
        type: this.selectedProcess?.type || 'generic'
      });
    }

    this.allResults = mockResults;
    this.filteredResults = [...mockResults];
  }

  // ===== TABLE METHODS =====
  trackByItem(index: number, item: ResultItem): string {
    return item.id;
  }

  sortBy(field: string): void {
    if (this.sortField === field) {
      this.sortDirection = this.sortDirection === 'asc' ? 'desc' : 'asc';
    } else {
      this.sortField = field;
      this.sortDirection = 'asc';
    }

    this.filteredResults.sort((a, b) => {
      let valueA: any = a[field as keyof ResultItem];
      let valueB: any = b[field as keyof ResultItem];

      if (field === 'startTime') {
        valueA = new Date(valueA).getTime();
        valueB = new Date(valueB).getTime();
      } else if (typeof valueA === 'string') {
        valueA = valueA.toLowerCase();
        valueB = valueB.toLowerCase();
      }

      const comparison = valueA < valueB ? -1 : valueA > valueB ? 1 : 0;
      return this.sortDirection === 'asc' ? comparison : -comparison;
    });

    this.updatePagination();
  }

  getSortIcon(field: string): string {
    if (this.sortField !== field) return 'unfold_more';
    return this.sortDirection === 'asc' ? 'keyboard_arrow_up' : 'keyboard_arrow_down';
  }

  // ===== SELECTION METHODS =====
  toggleSelectAll(): void {
    if (this.isAllSelected()) {
      this.selectedItems.clear();
    } else {
      this.paginatedResults.forEach(item => this.selectedItems.add(item.id));
    }
  }

  toggleSelectItem(itemId: string): void {
    if (this.selectedItems.has(itemId)) {
      this.selectedItems.delete(itemId);
    } else {
      this.selectedItems.add(itemId);
    }
  }

  isAllSelected(): boolean {
    return this.paginatedResults.length > 0 && 
           this.paginatedResults.every(item => this.selectedItems.has(item.id));
  }

  isSomeSelected(): boolean {
    return this.selectedItems.size > 0 && !this.isAllSelected();
  }

  // ===== PAGINATION METHODS =====
  updatePagination(): void {
    this.totalPages = Math.ceil(this.filteredResults.length / this.pageSize);
    this.currentPage = Math.min(this.currentPage, this.totalPages || 1);
    
    const startIndex = (this.currentPage - 1) * this.pageSize;
    const endIndex = startIndex + this.pageSize;
    this.paginatedResults = this.filteredResults.slice(startIndex, endIndex);
  }

  goToPage(page: number): void {
    if (page >= 1 && page <= this.totalPages) {
      this.currentPage = page;
      this.updatePagination();
    }
  }

  onPageSizeChange(): void {
    this.currentPage = 1;
    this.updatePagination();
  }

  getVisiblePages(): number[] {
    const pages: number[] = [];
    const maxVisible = 7;
    
    if (this.totalPages <= maxVisible) {
      for (let i = 1; i <= this.totalPages; i++) {
        pages.push(i);
      }
    } else {
      if (this.currentPage <= 4) {
        for (let i = 1; i <= 5; i++) pages.push(i);
        pages.push(-1); // ellipsis
        pages.push(this.totalPages);
      } else if (this.currentPage >= this.totalPages - 3) {
        pages.push(1);
        pages.push(-1); // ellipsis
        for (let i = this.totalPages - 4; i <= this.totalPages; i++) pages.push(i);
      } else {
        pages.push(1);
        pages.push(-1); // ellipsis
        for (let i = this.currentPage - 1; i <= this.currentPage + 1; i++) pages.push(i);
        pages.push(-1); // ellipsis
        pages.push(this.totalPages);
      }
    }
    
    return pages;
  }

  // ===== ACTION METHODS =====
  toggleSuspend(item: ResultItem): void {
    const newStatus = item.status === 'suspended' ? 'active' : 'suspended';
    item.status = newStatus;
    
    const action = newStatus === 'suspended' ? 'suspendu' : 'repris';
    this.showToast('success', `Processus ${action}`, 
      `Le processus ${item.instanceId} a été ${action} avec succès`);
  }

  transferTask(item: ResultItem): void {
    const task: Task = {
      id: item.id,
      processInstanceId: item.instanceId,
      processDefinitionId: item.definition,
      name: `Tâche ${item.definition}`,
      description: item.definitionDescription,
      assignee: item.initiator,
      created: item.startTime,
      priority: 50,
      status: 'assigned'
    };
    
    this.taskToTransfer = task;
    this.showTransferModal = true;
  }

  stopTask(item: ResultItem): void {
    this.confirmDialogConfig = {
      title: 'Confirmer l\'arrêt',
      message: `Êtes-vous sûr de vouloir arrêter le processus ${item.instanceId} ?`,
      confirmText: 'Arrêter',
      cancelText: 'Annuler',
      icon: 'stop_circle',
      iconColor: '#ef4444',
      theme: 'danger'
    };
    this.showConfirmDialog = true;
  }

  // ===== BULK ACTIONS =====
  bulkSuspend(): void {
    this.performBulkAction('suspend', 'Suspension en masse');
  }

  bulkResume(): void {
    this.performBulkAction('resume', 'Reprise en masse');
  }

  bulkTransfer(): void {
    const selectedTasks = this.getSelectedTasks();
    this.taskToTransfer = selectedTasks;
    this.showTransferModal = true;
  }

  bulkStop(): void {
    this.confirmDialogConfig = {
      title: 'Confirmer l\'arrêt en masse',
      message: `Êtes-vous sûr de vouloir arrêter ${this.selectedItems.size} processus ?`,
      confirmText: 'Arrêter tout',
      cancelText: 'Annuler',
      icon: 'stop_circle',
      iconColor: '#ef4444',
      theme: 'danger'
    };
    this.showConfirmDialog = true;
  }

  private performBulkAction(action: string, actionLabel: string): void {
    const count = this.selectedItems.size;
    
    // Simulate bulk action
    setTimeout(() => {
      this.selectedItems.clear();
      this.showToast('success', actionLabel, 
        `${count} processus traité(s) avec succès`);
    }, 1000);
  }

  private getSelectedTasks(): Task[] {
    return Array.from(this.selectedItems).map(id => {
      const item = this.filteredResults.find(r => r.id === id)!;
      return {
        id: item.id,
        processInstanceId: item.instanceId,
        processDefinitionId: item.definition,
        name: `Tâche ${item.definition}`,
        description: item.definitionDescription,
        assignee: item.initiator,
        created: item.startTime,
        priority: 50,
        status: 'assigned'
      };
    });
  }

  // ===== MODAL METHODS =====
  closeTransferModal(): void {
    this.showTransferModal = false;
    this.taskToTransfer = null;
  }

  closeBulkActionsModal(): void {
    this.showBulkActionsModal = false;
  }

  onTaskTransferred(assignment: TaskAssignment | TaskAssignment[]): void {
    const assignments = Array.isArray(assignment) ? assignment : [assignment];
    
    assignments.forEach(a => {
      this.showToast('success', 'Tâche transférée', 
        `Tâche ${a.taskId} transférée avec succès`);
    });
    
    this.closeTransferModal();
    this.selectedItems.clear();
  }

  onBulkActionExecuted(action: string): void {
    this.performBulkAction(action, `Action ${action}`);
    this.closeBulkActionsModal();
  }

  onConfirmDialogResult(confirmed: boolean): void {
    if (confirmed) {
      if (this.confirmDialogConfig.title.includes('masse')) {
        this.performBulkAction('stop', 'Arrêt en masse');
      } else {
        // Single item stop
        this.showToast('success', 'Processus arrêté', 'Le processus a été arrêté avec succès');
      }
    }
    this.showConfirmDialog = false;
  }

  // ===== UTILITY METHODS =====
  hideProcessSuggestions(): void {
    setTimeout(() => {
      this.showProcessSuggestions = false;
    }, 200);
  }

  hideTaskSuggestions(): void {
    setTimeout(() => {
      this.showTaskSuggestions = false;
    }, 200);
  }

  clearGlobalSearch(): void {
    this.globalSearchTerm = '';
    this.performGlobalSearch('');
  }

  viewInstanceDetails(instanceId: string, event: Event): void {
    event.preventDefault();
    this.showToast('info', 'Détails de l\'instance', 
      `Affichage des détails pour ${instanceId}`);
  }

  viewUserProfile(username: string, event: Event): void {
    event.preventDefault();
    this.showToast('info', 'Profil utilisateur', 
      `Affichage du profil de ${username}`);
  }

  highlightMatch(text: string, searchTerm: string): string {
    if (!searchTerm.trim()) return text;
    
    const regex = new RegExp(`(${searchTerm})`, 'gi');
    return text.replace(regex, '<span class="highlight">$1</span>');
  }

  formatDateTime(date: Date): string {
    return new Intl.DateTimeFormat('fr-FR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    }).format(date);
  }

  formatDate(dateString: string): string {
    return new Intl.DateTimeFormat('fr-FR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric'
    }).format(new Date(dateString));
  }

  getTimeAgeClass(date: Date): string {
    const now = new Date();
    const diffHours = (now.getTime() - date.getTime()) / (1000 * 60 * 60);
    
    if (diffHours < 24) return 'recent';
    if (diffHours < 168) return 'old'; // 1 week
    return 'very-old';
  }

  getProcessIcon(type: string): string {
    const icons: { [key: string]: string } = {
      'loan': 'account_balance',
      'account': 'person_add',
      'kyc': 'verified_user',
      'card': 'credit_card',
      'risk': 'security',
      'generic': 'settings'
    };
    return icons[type] || 'settings';
  }

  getStatusBadgeClass(status: string): string {
    const classes: { [key: string]: string } = {
      'active': 'bg-success',
      'suspended': 'bg-warning',
      'completed': 'bg-info',
      'failed': 'bg-danger',
      'pending': 'bg-secondary'
    };
    return classes[status] || 'bg-secondary';
  }

  getStatusIcon(status: string): string {
    const icons: { [key: string]: string } = {
      'active': 'play_circle',
      'suspended': 'pause_circle',
      'completed': 'check_circle',
      'failed': 'error',
      'pending': 'schedule'
    };
    return icons[status] || 'help';
  }

  getStatusLabel(status: string): string {
    const labels: { [key: string]: string } = {
      'active': 'En cours',
      'suspended': 'Suspendue',
      'completed': 'Terminée',
      'failed': 'Échec',
      'pending': 'En attente'
    };
    return labels[status] || status;
  }

  getStatusTooltip(status: string): string {
    const tooltips: { [key: string]: string } = {
      'active': 'Processus en cours d\'exécution',
      'suspended': 'Processus temporairement suspendu',
      'completed': 'Processus terminé avec succès',
      'failed': 'Processus terminé en erreur',
      'pending': 'Processus en attente de traitement'
    };
    return tooltips[status] || '';
  }

  // ===== TOAST METHODS =====
  private showToast(type: 'success' | 'error' | 'warning' | 'info', title: string, message: string): void {
    const toast: Toast = {
      id: Date.now().toString(),
      title,
      message,
      type,
      duration: 5000
    };
    
    this.toasts.push(toast);
    
    // Auto remove after duration
    setTimeout(() => {
      this.removeToast(toast.id);
    }, toast.duration);
  }

  removeToast(id: string): void {
    this.toasts = this.toasts.filter(toast => toast.id !== id);
  }
}