import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
// import { NotificationService } from '../../../core/services/notification.service';
import { TaskService } from '../../../core/services/task.service';
import { HelpService } from '../../../core/services/help.service';
import { NotificationsModalComponent } from '../notifications-modal/notifications-modal.component';
import { SettingsModalComponent } from '../settings-modal/settings-modal.component';
import { combineLatest } from 'rxjs';
import {AuthService} from "../../../core/services/auth.service";
import {jwtDecode} from "jwt-decode";

@Component({
  selector: 'app-header',
  standalone: true,
  imports: [CommonModule, NotificationsModalComponent, SettingsModalComponent],
  templateUrl: './header.component.html',
  styleUrls: ['./header.component.scss']
})
export class HeaderComponent implements OnInit {
  currentDate = new Date();
  notificationCount = 0;
  showNotificationsModal = false;
  showSettingsModal = false;

  userName = 'User';
  userRole = 'Utilisateur';
  constructor(
      // private notificationService: NotificationService,
      private taskService: TaskService,
      private authService: AuthService,
      private helpService: HelpService
  ) {}

  ngOnInit(): void {
    // this.loadNotificationCount();

    const tokenData = this.authService.getDecodedToken();
    if (tokenData) {
      this.userName = tokenData.name || tokenData.preferred_username;
      this.userRole = tokenData.realm_access?.roles?.[0] || 'Utilisateur';
    }

    setInterval(() => {
      this.currentDate = new Date();
    }, 60000);
  }

  // loadNotificationCount(): void {
  //   // Combiner les notifications des processus et des tâches
  //   combineLatest([
  //     this.notificationService.getNotificationCount(),
  //     this.taskService.getUnreadNotificationCount()
  //   ]).subscribe(([processCount, taskCount]) => {
  //     this.notificationCount = processCount + taskCount;
  //   });
  // }

  onNotificationsClick(): void {
    this.showNotificationsModal = true;
  }

  onHelpClick(): void {
    this.helpService.downloadUserGuide();
  }

  onSettingsClick(): void {
    this.showSettingsModal = true;
  }

  onCloseNotificationsModal(): void {
    this.showNotificationsModal = false;
  }

  onCloseSettingsModal(): void {
    this.showSettingsModal = false;
  }
}