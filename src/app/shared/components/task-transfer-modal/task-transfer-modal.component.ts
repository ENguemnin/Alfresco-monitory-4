import {
  Component, Input, Output, EventEmitter, OnInit, OnChanges, SimpleChanges, OnDestroy
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Subscription } from 'rxjs';

import { TasksService } from '../../../core/services/tasks.service';
import { AuthService } from '../../../core/services/auth.service';
import { Task, User, TaskAssignment } from '../../../core/models/task.model';
import { WebSocketService } from "../../../core/services/websocket.service";
import { environment } from '../../../../environments/environment';

@Component({
  selector: 'app-task-transfer-modal',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './task-transfer-modal.component.html',
  styleUrls: ['./task-transfer-modal.component.scss']
})
export class TaskTransferModalComponent implements OnInit, OnChanges, OnDestroy {
  @Input() isOpen = false;
  @Input() taskData: Task | Task[] | null = null;
  @Output() closeModal = new EventEmitter<void>();
  @Output() taskTransferred = new EventEmitter<TaskAssignment[]>();

  currentStep = 1;
  selectedAssigneeType: 'manager' | 'group' | 'user' | null = null;
  selectedUserId: string | null = null;

  users: User[] = [];
  filteredUsers: User[] = [];
  searchTerm = '';
  loadingUsers = false;
  transferring = false;
  transferError = false;
  errorMessage = '';

  private wsSubscription?: Subscription;
  private currentUserId: string;

  constructor(
      private taskService: TasksService,
      private authService: AuthService,
      private http: HttpClient,
      private websocketService: WebSocketService
  ) {
    this.currentUserId = this.authService.getDecodedToken()?.sub || '';
  }

  ngOnInit(): void {}

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['isOpen']?.currentValue) {
      this.loadUsers();
      this.resetTransferState();
    }
  }

  ngOnDestroy(): void {
    this.wsSubscription?.unsubscribe();
  }

  protected getTasksArray(): Task[] {
    if (!this.taskData) return [];
    return Array.isArray(this.taskData) ? this.taskData : [this.taskData];
  }


  private resetTransferState(): void {
    this.currentStep = 1;
    this.selectedAssigneeType = null;
    this.selectedUserId = null;
    this.searchTerm = '';
    this.transferring = false;
    this.transferError = false;
    this.errorMessage = '';
  }

  loadUsers(): void {
    this.loadingUsers = true;
    this.taskService.getUsers().subscribe({
      next: (users) => {
        this.users = users;
        this.filteredUsers = users;
        this.loadingUsers = false;
      },
      error: () => {
        this.loadingUsers = false;
      }
    });
  }

  selectAssigneeType(type: 'manager' | 'group' | 'user'): void {
    this.selectedAssigneeType = type;
  }

  selectUser(userId: string): void {
    this.selectedUserId = userId;
  }

  filterUsers(): void {
    const term = this.searchTerm?.toLowerCase().trim();
    this.filteredUsers = !term
        ? this.users
        : this.users.filter(user =>
            (user.firstName?.toLowerCase().includes(term) || '') ||
            (user.lastName?.toLowerCase().includes(term) || '') ||
            (user.email?.toLowerCase().includes(term) || '') ||
            (user.role?.toLowerCase().includes(term) || '')
        );
  }

  goBack(): void {
    this.currentStep = 1;
    this.selectedUserId = null;
  }

  canProceed(): boolean {
    return this.currentStep === 1
        ? this.selectedAssigneeType !== null
        : this.currentStep === 2
            ? this.selectedUserId !== null
            : false;
  }

  async onTransfer(): Promise<void> {
    if (!this.canProceed()) {
      console.warn('⚠️ Transfert impossible: condition non remplie.');
      return;
    }

    if (this.selectedAssigneeType === 'user' && this.currentStep === 1) {
      this.currentStep = 2;
      return;
    }

    this.transferring = true;
    this.transferError = false;
    const tasks = this.getTasksArray();
    console.log('📝 Tâches à transférer (utilisateur spécifique) :', tasks); // ✅

    const successfulTransfers: TaskAssignment[] = [];

    try {
      const assigneeEmail = this.users.find(u => u.id === this.selectedUserId)?.email || '';
      if (!this.currentUserId || !assigneeEmail) {
        throw new Error('🔍 Informations utilisateur manquantes.');
      }

      const basicAuthHeader = this.authService.getBasicAuthHeader();
      if (!basicAuthHeader) throw new Error('🔐 Informations d\'authentification introuvables.');

      const fetchedUserId = await this.http
          .get<string>(`${environment.api2Url}/db-id-by-email?email=${encodeURIComponent(assigneeEmail)}`, { responseType: 'text' as 'json' })
          .toPromise();

      if (!fetchedUserId || fetchedUserId.trim() === '') {
        throw new Error(`🛑 ID introuvable pour l'email: ${assigneeEmail}`);
      }

      const trimmedUserId = fetchedUserId.trim();

      for (const task of tasks) {
        try {
          const assignment: TaskAssignment = {
            taskId: task.id,
            assigneeType: this.selectedAssigneeType!,
            assigneeId: this.selectedUserId || undefined
          };

          await this.http.put(
              `${environment.BASE_URL}/activiti-app/api/enterprise/tasks/${assignment.taskId}/action/assign`,
              {
                assignee: trimmedUserId,
                email: assigneeEmail
              },
              {
                headers: new HttpHeaders({
                  'Content-Type': 'application/json',
                  'Accept': 'application/json',
                  'Authorization': `Bearer ${this.authService.accessToken}`
                })
              }
          ).toPromise();


          const payload = {
            taskId: assignment.taskId,
            message: `Vous avez une nouvelle tâche à examiner.`,
            senderId: this.currentUserId,
            targetUserId: this.selectedUserId
          };

          await this.sendHttpNotification(payload);
          successfulTransfers.push(assignment);
        } catch (taskError) {
          console.error(`❌ Erreur durant le transfert de la tâche ${task.id}:`, taskError);
        }
      }

      if (successfulTransfers.length > 0) {
        await this.sendEmailNotification(
            assigneeEmail,
            'Nouvelle(s) tâche(s) assignée(s)',
            `Bonjour,\n\n${successfulTransfers.length} tâche(s) vous a/ont été assignée(s) dans le système.\nMerci de les traiter dès que possible.`
        );
      }

      if (successfulTransfers.length === tasks.length) {
        this.taskTransferred.emit(successfulTransfers);
        this.onClose();
      } else if (successfulTransfers.length > 0) {
        this.taskTransferred.emit(successfulTransfers);
        this.handleTransferError(`Seules ${successfulTransfers.length} tâche(s) sur ${tasks.length} ont été transférées.`);
      } else {
        throw new Error('Aucune tâche n\'a pu être transférée.');
      }
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'Échec du transfert.';
      this.handleTransferError(msg);
      console.error('❌ Erreur durant le transfert:', error);
    } finally {
      this.transferring = false;
    }
  }

  async onManagerTransfer(): Promise<void> {
    const tasks = this.getTasksArray();
    console.log('📝 Tâches à transférer (manager) :', tasks); // ✅

    if (tasks.length === 0) {
      console.warn('⚠️ Aucune tâche disponible.');
      return;
    }

    this.transferring = true;
    this.transferError = false;
    const successfulTransfers: TaskAssignment[] = [];

    try {
      const managerEmail = (tasks[0] as any).managerEmail;
      const managerId = (tasks[0] as any).managerId;

      if (!managerEmail || managerEmail.trim() === '') {
        throw new Error('Aucun email de manager disponible pour ce processus.');
      }

      // const response = await this.http
      //     .get(`http://localhost:8082/api/users/id-by-email?email=${encodeURIComponent(managerEmail)}`, {
      //       responseType: 'text'
      //     })
      //     .toPromise();

      // const targetUserId = response?.trim();

      // if (!this.currentUserId || !targetUserId || targetUserId === '') {
      //   throw new Error(`Le manager (${managerEmail}) n'a pas pu être trouvé dans le système.`);
      // }

      const basicAuthHeader = this.authService.getBasicAuthHeader();
      if (!basicAuthHeader) throw new Error('Identifiants non disponibles.');

      for (const task of tasks) {
        try {
          const assignment: TaskAssignment = {
            taskId: task.id,
            assigneeType: 'manager',
            // assigneeId: targetUserId
          };

          await this.http.put(
              `${environment.BASE_URL}/activiti-app/api/enterprise/tasks/${assignment.taskId}/action/assign`,
              { assignee: managerId, email: managerEmail },
              {
                headers: new HttpHeaders({
                  'Content-Type': 'application/json',
                  'Accept': 'application/json',
                  'Authorization': `Bearer ${this.authService.accessToken}`
                })
              }
          ).toPromise();

          // const payload = {
          //   taskId: assignment.taskId,
          //   message: `Vous avez une nouvelle tâche à examiner.`,
          //   senderId: this.currentUserId,
          //   targetUserId: targetUserId
          // };
          //
          // await this.sendHttpNotification(payload);
           successfulTransfers.push(assignment);
        } catch (taskError) {
          console.error(`❌ Erreur durant le transfert de la tâche ${task.id} au manager:`, taskError);
        }
      }

      if (successfulTransfers.length > 0) {
        await this.sendEmailNotification(
            managerEmail,
            'Tâche(s) transférée(s) au Manager',
            `Bonjour,\n\n${successfulTransfers.length} tâche(s) vous a/ont été transférée(s) pour validation dans le système.\nVeuillez les consulter rapidement.`
        );
      }

      if (successfulTransfers.length === tasks.length) {
        this.taskTransferred.emit(successfulTransfers);
        this.onClose();
      } else if (successfulTransfers.length > 0) {
        this.taskTransferred.emit(successfulTransfers);
        this.handleTransferError(`Seules ${successfulTransfers.length} tâche(s) sur ${tasks.length} ont été transférées.`);
      } else {
        throw new Error('Aucune tâche n\'a pu être transférée au manager.');
      }
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'Échec du transfert vers le manager.';
      this.handleTransferError(msg);
      console.error('❌ Erreur transfert manager :', error);
    } finally {
      this.transferring = false;
    }
  }

  async onTransferGroup(): Promise<void> {
    const tasks = this.getTasksArray();
    console.log('📝 Tâches à transférer (groupe) :', tasks); // ✅

    if (tasks.length === 0) {
      console.warn('⚠️ Aucune tâche disponible.');
      this.handleTransferError('Aucune tâche disponible.');
      return;
    }

    this.transferring = true;
    this.transferError = false;
    const successfulTransfers: TaskAssignment[] = [];

    try {
      const groupId = (tasks[0] as any).groupId;
      const groupName = (tasks[0] as any).groupName;

      if (!groupId) {
        throw new Error('Aucun groupe associé à cette tâche.');
      }

      const basicAuthHeader = this.authService.getBasicAuthHeader();
      if (!basicAuthHeader) throw new Error('Identifiants de connexion introuvables.');

      // const userIds = await this.http
      //     .get<string[]>(`http://localhost:8082/api/users/members-by-group-name?groupName=${encodeURIComponent(groupName)}`)
      //     .toPromise() ?? [];

      const userEmails = await this.http
          .get<string[]>(
              `${environment.api2Url}/group/${encodeURIComponent(groupId)}/emails`,
              {
                headers: new HttpHeaders({
                  'Content-Type': 'application/json',
                  'Authorization': `Bearer ${this.authService.accessToken}`
                })
              }
          )
          .toPromise() ?? [];


      for (const task of tasks) {
        try {
          await this.http.put(
              `${environment.BASE_URL}/activiti-app/api/enterprise/tasks/${task.id}/action/unclaim`,
              null,
              {
                headers: new HttpHeaders({
                  'Content-Type': 'application/json',
                  'Authorization': `Bearer ${this.authService.accessToken}`
                })
              }
          ).toPromise();


          // await Promise.all(userIds.map(async (userId, index) => {
          //   const email = userEmails[index];
          // //   const payload = {
          // //     taskId: task.id,
          // //     message: `Vous avez une nouvelle tâche à examiner (Groupe: ${groupName}).`,
          // //     senderId: this.currentUserId,
          // //     targetUserId: userId
          // //   };
          // //
          //   await this.sendHttpNotification(payload);

          for (const email of userEmails) {
            if (email) {
              const emailPayload = {
                to: email,
                subject: `Nouvelle Tâche Assignée - Groupe ${groupName}`,
                body: `Bonjour,\n\nUne nouvelle tâche vous a été assignée dans le groupe "${groupName}".\n\nVeuillez vous connecter à la plateforme pour plus de détails.\n\nMerci.`
              };

              await this.http.post(`${environment.api2Url}/notifications/send-email`, emailPayload).toPromise();
            }
          }

          successfulTransfers.push({
            taskId: task.id,
            assigneeType: 'group',
            assigneeId: groupId
          });
        } catch (taskError) {
          console.error(`❌ Erreur durant le transfert de la tâche ${task.id} au groupe:`, taskError);
        }
      }

      if (successfulTransfers.length === tasks.length) {
        this.taskTransferred.emit(successfulTransfers);
        this.onClose();
      } else if (successfulTransfers.length > 0) {
        this.taskTransferred.emit(successfulTransfers);
        this.handleTransferError(`Seules ${successfulTransfers.length} tâche(s) sur ${tasks.length} ont été transférées.`);
      } else {
        throw new Error('Aucune tâche n\'a pu être transférée au groupe.');
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Échec du transfert au groupe.';
      this.handleTransferError(message);
      console.error('❌ Erreur transfert groupe :', error);
    } finally {
      this.transferring = false;
    }
  }

  private async sendHttpNotification(payload: any): Promise<void> {
    try {
      await this.http.post(`${environment.apiUrl}/notifications/notify-user`, payload).toPromise();
    } catch (error) {
      console.warn('HTTP notification failed:', error);
      throw error;
    }
  }

  private async sendEmailNotification(to: string, subject: string, body: string): Promise<void> {
    try {
      await this.http.post(
          `${environment.api2Url}/notifications/send-email`,
          { to, subject, body },
          {
            responseType: 'text' as 'json'
          }
      ).toPromise();
      console.log(`📧 Email envoyé à ${to}`);
    } catch (error) {
      console.warn('❌ Échec de l\'envoi de l\'email:', error);
    }
  }

  private handleTransferError(message: string): void {
    this.transferError = true;
    this.errorMessage = message;
    setTimeout(() => {
      this.transferError = false;
      this.errorMessage = '';
    }, 5000);
  }

  onClose(): void {
    this.resetTransferState();
    this.closeModal.emit();
  }

  onBackdropClick(event: Event): void {
    if (event.target === event.currentTarget) {
      this.onClose();
    }
  }
}