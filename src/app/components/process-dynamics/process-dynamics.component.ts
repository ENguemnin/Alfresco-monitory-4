import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

interface Application {
  name: string;
  icon: string;
  description: string;
}

interface DurationOption {
  label: string;
  value: string;
  description: string;
}

interface ProcessType {
  name: string;
  value: string;
  icon: string;
  description: string;
}

interface Process {
  id: string;
  name: string;
  status: 'active' | 'suspended' | 'completed' | 'failed';
  startDate: Date;
  initiator: string;
  duration: number; // en minutes
}

interface Task {
  id: string;
  processId: string;
  name: string;
  status: 'completed' | 'in-progress' | 'pending' | 'failed';
  assignee?: string;
  createdDate: Date;
  modifiedDate?: Date;
  dueDate?: Date;
  priority: 'high' | 'medium' | 'low';
  category: string;
  description?: string;
  progress?: number;
  hasProblems?: boolean;
  attachments?: Array<{ name: string; url: string }>;
  history?: Array<{ date: Date; description: string; user: string }>;
}

interface User {
  id: string;
  name: string;
  initials: string;
  role: string;
}

interface Group {
  id: string;
  name: string;
  description: string;
  memberCount: number;
}

interface Manager {
  id: string;
  name: string;
  initials: string;
  title: string;
  department: string;
  level: number;
}

@Component({
  selector: 'app-process-dynamics',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './process-dynamics.component.html',
  styleUrls: ['./process-dynamics.component.scss']
})
export class ProcessDynamicsComponent implements OnInit {
  // État de l'interface
  showProcessView = false;
  isLoading = false;

  // Données du formulaire de filtrage
  availableApps: Application[] = [
    { name: 'Loan Management', icon: '💰', description: 'Gestion des prêts et crédits' },
    { name: 'Customer Onboarding', icon: '👤', description: 'Intégration des nouveaux clients' },
    { name: 'Document Processing', icon: '📄', description: 'Traitement des documents' },
    { name: 'Risk Assessment', icon: '⚠️', description: 'Évaluation des risques' },
    { name: 'Compliance Check', icon: '✅', description: 'Vérification de conformité' }
  ];

  selectedApps: string[] = [];
  isAppDropdownOpen = false;
  appSearchTerm = '';

  durationOptions: DurationOption[] = [
    { label: '24h', value: '24h', description: ' ' },
    { label: '3 jours', value: '3d', description: '' },
    { label: '1 semaine', value: '1w', description: '' },
    { label: '1 mois', value: '1m', description: ' ' },
    { label: '3 mois', value: '3m', description: '' },
    { label: '6 mois', value: '6m', description: '' },
    { label: '1 an', value: '1y', description: ' ' },
    { label: '2 ans', value: '2y', description: '' }
  ];

  selectedDuration = '1w';

  processTypes: ProcessType[] = [
    {
      name: 'Processus abandonnés',
      value: 'abandoned',
      icon: '❌',
      description: 'Processus interrompus avant leur terme'
    },
    {
      name: 'Uniquement par son initiateur',
      value: 'initiator-only',
      icon: '👤',
      description: 'Processus traités uniquement par leur créateur'
    },
    {
      name: 'Avec une seule tâche exécutée',
      value: 'single-task',
      icon: '⚡',
      description: 'Processus avec très peu d\'activité'
    },
    {
      name: 'Avec erreur/exception technique',
      value: 'technical-error',
      icon: '⚠️',
      description: 'Processus ayant rencontré des erreurs'
    },
    {
      name: 'Sans aucune tâche utilisateur',
      value: 'no-user-task',
      icon: '🚫',
      description: 'Processus entièrement automatisés'
    }
  ];

  selectedProcessTypes: string[] = [];

  // Données de la vue processus
  processes: Process[] = [];
  filteredProcesses: Process[] = [];
  selectedProcess: Process | null = null;

  tasks: Task[] = [];
  filteredTasks: Task[] = [];
  selectedTask: Task | null = null;
  selectedTasks: Task[] = [];

  // Contrôles de recherche et filtrage
  processSearchTerm = '';
  taskSearchTerm = '';
  processSortBy = 'newest';
  activeQuickFilter = 'all';

  quickFilters = [
    { label: 'Tous', value: 'all' },
    { label: 'Actifs', value: 'active' },
    { label: 'Suspendus', value: 'suspended' },
    { label: 'Terminés', value: 'completed' },
    { label: 'Échoués', value: 'failed' }
  ];

  // Modal de transfert
  showTransferModal = false;
  transferTasks: Task[] = [];
  transferType: 'person' | 'group' | 'manager' = 'person';
  userSearchTerm = '';
  userSearchResults: User[] = [];
  selectedUser: User | null = null;
  selectedGroup: Group | null = null;
  selectedManager: Manager | null = null;
  transferComment = '';
  notifyAssignee = true;
  notifyOriginal = false;
  isTransferring = false;

  // Données pour le transfert
  availableGroups: Group[] = [
    { id: '1', name: 'Équipe Crédit', description: 'Spécialistes en analyse de crédit', memberCount: 8 },
    { id: '2', name: 'Support Client', description: 'Service client et support', memberCount: 12 },
    { id: '3', name: 'Conformité', description: 'Équipe de vérification réglementaire', memberCount: 5 }
  ];

  availableManagers: Manager[] = [
    { id: '1', name: 'Marie Dubois', initials: 'MD', title: 'Directrice Crédit', department: 'Crédit', level: 1 },
    { id: '2', name: 'Jean Martin', initials: 'JM', title: 'Chef de Service', department: 'Support', level: 2 },
    { id: '3', name: 'Sophie Laurent', initials: 'SL', title: 'Responsable Conformité', department: 'Conformité', level: 2 }
  ];

  // Toast de succès
  showSuccessToast = false;
  successMessage = '';

  ngOnInit(): void {
    this.generateMockData();
  }

  // ===== MÉTHODES DU FORMULAIRE DE FILTRAGE =====

  get filteredApps(): Application[] {
    if (!this.appSearchTerm) return this.availableApps;
    return this.availableApps.filter(app =>
      app.name.toLowerCase().includes(this.appSearchTerm.toLowerCase()) ||
      app.description.toLowerCase().includes(this.appSearchTerm.toLowerCase())
    );
  }

  toggleAppDropdown(): void {
    this.isAppDropdownOpen = !this.isAppDropdownOpen;
  }

  toggleApp(appName: string): void {
    const index = this.selectedApps.indexOf(appName);
    if (index > -1) {
      this.selectedApps.splice(index, 1);
    } else {
      this.selectedApps.push(appName);
    }
  }

  removeApp(appName: string, event: Event): void {
    event.stopPropagation();
    const index = this.selectedApps.indexOf(appName);
    if (index > -1) {
      this.selectedApps.splice(index, 1);
    }
  }

  selectDuration(duration: string): void {
     this.selectedDuration = duration;
  }

  toggleProcessType(type: string): void {
    const index = this.selectedProcessTypes.indexOf(type);
    if (index > -1) {
      this.selectedProcessTypes.splice(index, 1);
    } else {
      this.selectedProcessTypes.push(type);
    }
  }

  applyFilters(): void {
    this.isLoading = true;
    
    // Simulation du chargement
    setTimeout(() => {
      this.isLoading = false;
      this.showProcessView = true;
      this.filterProcesses();
    }, 2000);
  }

  goBackToFilters(): void {
    this.showProcessView = false;
    this.selectedProcess = null;
    this.selectedTask = null;
    this.selectedTasks = [];
  }

  // ===== MÉTHODES DE LA VUE PROCESSUS =====

  generateMockData(): void {
    // Génération des processus mock
    this.processes = [
      {
        id: '1',
        name: 'Loan Application - John Doe',
        status: 'active',
        startDate: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000),
        initiator: 'john.admin',
        duration: 4320 // 3 jours en minutes
      },
      {
        id: '2',
        name: 'Document Verification - Jane Smith',
        status: 'suspended',
        startDate: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000),
        initiator: 'jane.admin',
        duration: 7200
      },
      {
        id: '3',
        name: 'Credit Evaluation - Bob Wilson',
        status: 'completed',
        startDate: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000),
        initiator: 'bob.admin',
        duration: 2880
      },
      {
        id: '4',
        name: 'Risk Assessment - Alice Brown',
        status: 'failed',
        startDate: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000),
        initiator: 'alice.admin',
        duration: 1440
      }
    ];

    // Génération des tâches mock
    this.tasks = [
      {
        id: '1',
        processId: '1',
        name: 'Fill Loan Application',
        status: 'completed',
        assignee: 'John Doe',
        createdDate: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000),
        modifiedDate: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000),
        priority: 'high',
        category: 'Documentation',
        description: 'Remplir le formulaire de demande de prêt avec toutes les informations requises',
        attachments: [
          { name: 'application_form.pdf', url: '#' },
          { name: 'identity_document.pdf', url: '#' }
        ],
        history: [
          { date: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000), description: 'Tâche créée', user: 'Système' },
          { date: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000), description: 'Tâche terminée', user: 'John Doe' }
        ]
      },
      {
        id: '2',
        processId: '1',
        name: 'Review Application',
        status: 'in-progress',
        assignee: 'Marie Dubois',
        createdDate: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000),
        dueDate: new Date(Date.now() + 24 * 60 * 60 * 1000),
        priority: 'high',
        category: 'Review',
        description: 'Examiner la demande de prêt et vérifier la conformité',
        progress: 65,
        history: [
          { date: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000), description: 'Tâche créée', user: 'Système' },
          { date: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000), description: 'Révision commencée', user: 'Marie Dubois' }
        ]
      },
      {
        id: '3',
        processId: '1',
        name: 'Final Approval',
        status: 'pending',
        createdDate: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000),
        priority: 'medium',
        category: 'Approval',
        description: 'Approbation finale du prêt par le directeur',
        history: [
          { date: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000), description: 'Tâche créée', user: 'Système' }
        ]
      },
      {
        id: '4',
        processId: '2',
        name: 'Document OCR',
        status: 'failed',
        assignee: 'Système OCR',
        createdDate: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000),
        priority: 'high',
        category: 'Processing',
        description: 'Extraction automatique des données des documents',
        hasProblems: true,
        history: [
          { date: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000), description: 'Tâche créée', user: 'Système' },
          { date: new Date(Date.now() - 4 * 24 * 60 * 60 * 1000), description: 'Échec OCR - Document illisible', user: 'Système' }
        ]
      }
    ];

    this.filteredProcesses = [...this.processes];
  }

  filterProcesses(): void {
    let filtered = [...this.processes];

    // Filtre par recherche
    if (this.processSearchTerm) {
      const term = this.processSearchTerm.toLowerCase();
      filtered = filtered.filter(process =>
        process.name.toLowerCase().includes(term) ||
        process.initiator.toLowerCase().includes(term)
      );
    }

    // Filtre rapide par statut
    if (this.activeQuickFilter !== 'all') {
      filtered = filtered.filter(process => process.status === this.activeQuickFilter);
    }

    // Tri
    switch (this.processSortBy) {
      case 'newest':
        filtered.sort((a, b) => b.startDate.getTime() - a.startDate.getTime());
        break;
      case 'oldest':
        filtered.sort((a, b) => a.startDate.getTime() - b.startDate.getTime());
        break;
      case 'name':
        filtered.sort((a, b) => a.name.localeCompare(b.name));
        break;
      case 'status':
        filtered.sort((a, b) => a.status.localeCompare(b.status));
        break;
    }

    this.filteredProcesses = filtered;
  }

  setQuickFilter(filter: string): void {
    this.activeQuickFilter = filter;
    this.filterProcesses();
  }

  sortProcesses(): void {
    this.filterProcesses();
  }

  selectProcess(process: Process): void {
    this.selectedProcess = process;
    this.selectedTask = null;
    this.selectedTasks = [];
    this.filterTasks();
  }

  getTasks(): Task[] {
    if (!this.selectedProcess) return [];
    return this.tasks.filter(task => task.processId === this.selectedProcess!.id);
  }

  filterTasks(): void {
    let filtered = this.getTasks();

    if (this.taskSearchTerm) {
      const term = this.taskSearchTerm.toLowerCase();
      filtered = filtered.filter(task =>
        task.name.toLowerCase().includes(term) ||
        (task.assignee && task.assignee.toLowerCase().includes(term))
      );
    }

    this.filteredTasks = filtered;
  }

  selectTask(task: Task): void {
    this.selectedTask = task;
  }

  toggleTaskSelection(task: Task, event: Event): void {
    const checkbox = event.target as HTMLInputElement;
    if (checkbox.checked) {
      if (!this.selectedTasks.includes(task)) {
        this.selectedTasks.push(task);
      }
    } else {
      const index = this.selectedTasks.indexOf(task);
      if (index > -1) {
        this.selectedTasks.splice(index, 1);
      }
    }
  }

  getPendingTasksCount(): number {
    return this.getTasks().filter(task => task.status === 'pending' || task.status === 'in-progress').length;
  }

  // Actions sur les processus
  toggleSuspend(process: Process, event: Event): void {
    event.stopPropagation();
    process.status = process.status === 'suspended' ? 'active' : 'suspended';
    this.showToast(`Processus ${process.status === 'suspended' ? 'suspendu' : 'repris'} avec succès`);
  }

  stopProcess(process: Process, event: Event): void {
    event.stopPropagation();
    if (confirm('Êtes-vous sûr de vouloir arrêter ce processus ?')) {
      process.status = 'failed';
      this.showToast('Processus arrêté avec succès');
    }
  }

  viewDetails(process: Process, event: Event): void {
    event.stopPropagation();
    this.selectProcess(process);
  }

  refreshData(): void {
    this.generateMockData();
    this.showToast('Données actualisées');
  }

  // ===== MÉTHODES DU MODAL DE TRANSFERT =====

  openTransferModal(task: Task): void {
    this.transferTasks = [task];
    this.showTransferModal = true;
    this.resetTransferForm();
  }

  openBulkTransferModal(): void {
    this.transferTasks = [...this.selectedTasks];
    this.showTransferModal = true;
    this.resetTransferForm();
  }

  closeTransferModal(): void {
    this.showTransferModal = false;
    this.resetTransferForm();
  }

  resetTransferForm(): void {
    this.transferType = 'person';
    this.userSearchTerm = '';
    this.userSearchResults = [];
    this.selectedUser = null;
    this.selectedGroup = null;
    this.selectedManager = null;
    this.transferComment = '';
    this.notifyAssignee = true;
    this.notifyOriginal = false;
  }

  setTransferType(type: 'person' | 'group' | 'manager'): void {
    this.transferType = type;
    this.selectedUser = null;
    this.selectedGroup = null;
    this.selectedManager = null;
  }

  searchUsers(): void {
    if (this.userSearchTerm.length < 2) {
      this.userSearchResults = [];
      return;
    }

    // Simulation de recherche d'utilisateurs
    const mockUsers: User[] = [
      { id: '1', name: 'Marie Dubois', initials: 'MD', role: 'Analyste Crédit' },
      { id: '2', name: 'Jean Martin', initials: 'JM', role: 'Superviseur' },
      { id: '3', name: 'Sophie Laurent', initials: 'SL', role: 'Responsable Conformité' },
      { id: '4', name: 'Pierre Durand', initials: 'PD', role: 'Analyste Senior' }
    ];

    this.userSearchResults = mockUsers.filter(user =>
      user.name.toLowerCase().includes(this.userSearchTerm.toLowerCase()) ||
      user.role.toLowerCase().includes(this.userSearchTerm.toLowerCase())
    );
  }

  selectUser(user: User): void {
    this.selectedUser = user;
    this.userSearchTerm = user.name;
    this.userSearchResults = [];
  }

  selectGroup(group: Group): void {
    this.selectedGroup = group;
  }

  selectManager(manager: Manager): void {
    this.selectedManager = manager;
  }

  canConfirmTransfer(): boolean {
    switch (this.transferType) {
      case 'person':
        return !!this.selectedUser;
      case 'group':
        return !!this.selectedGroup;
      case 'manager':
        return !!this.selectedManager;
      default:
        return false;
    }
  }

  confirmTransfer(): void {
    if (!this.canConfirmTransfer()) return;

    this.isTransferring = true;

    // Simulation du transfert
    setTimeout(() => {
      this.isTransferring = false;
      this.closeTransferModal();
      
      let assigneeName = '';
      switch (this.transferType) {
        case 'person':
          assigneeName = this.selectedUser!.name;
          break;
        case 'group':
          assigneeName = this.selectedGroup!.name;
          break;
        case 'manager':
          assigneeName = this.selectedManager!.name;
          break;
      }

      // Mettre à jour les tâches transférées
      this.transferTasks.forEach(task => {
        task.assignee = assigneeName;
        task.modifiedDate = new Date();
        task.history?.push({
          date: new Date(),
          description: `Tâche transférée à ${assigneeName}`,
          user: 'Utilisateur actuel'
        });
      });

      this.selectedTasks = [];
      this.showToast(`${this.transferTasks.length} tâche(s) transférée(s) à ${assigneeName}`);
    }, 2000);
  }

  // ===== MÉTHODES UTILITAIRES =====

  formatDate(date: Date): string {
    return new Intl.DateTimeFormat('fr-FR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    }).format(date);
  }

  formatDuration(minutes: number): string {
    const days = Math.floor(minutes / (24 * 60));
    const hours = Math.floor((minutes % (24 * 60)) / 60);
    const mins = minutes % 60;

    if (days > 0) {
      return `${days}j ${hours}h`;
    } else if (hours > 0) {
      return `${hours}h ${mins}min`;
    } else {
      return `${mins}min`;
    }
  }

  getStatusLabel(status: string): string {
    const labels: { [key: string]: string } = {
      'active': 'Actif',
      'suspended': 'Suspendu',
      'completed': 'Terminé',
      'failed': 'Échoué'
    };
    return labels[status] || status;
  }

  getTaskStatusLabel(status: string): string {
    const labels: { [key: string]: string } = {
      'completed': 'Terminée',
      'in-progress': 'En cours',
      'pending': 'En attente',
      'failed': 'Échouée'
    };
    return labels[status] || status;
  }

  getPriorityLabel(priority: string): string {
    const labels: { [key: string]: string } = {
      'high': 'Haute',
      'medium': 'Moyenne',
      'low': 'Basse'
    };
    return labels[priority] || priority;
  }

  getProcessName(processId: string): string {
    const process = this.processes.find(p => p.id === processId);
    return process ? process.name : 'Processus inconnu';
  }

  showToast(message: string): void {
    this.successMessage = message;
    this.showSuccessToast = true;
    setTimeout(() => {
      this.showSuccessToast = false;
    }, 3000);
  }
}