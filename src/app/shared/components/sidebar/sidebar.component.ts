import { Component, OnInit, Input } from "@angular/core";
import { RouterModule } from "@angular/router";
import { CommonModule } from "@angular/common";
import { AuthService } from "../../../core/services/auth.service";

@Component({
  selector: "app-sidebar",
  standalone: true,
  imports: [CommonModule, RouterModule],
  templateUrl: "./sidebar.component.html",
  styleUrls: ["./sidebar.component.scss"],
})
export class SidebarComponent implements OnInit {
  menuItems = [
    {
      label: "Dashboard",
      icon: "dashboard",
      route: "/dashboard",
    },
    {
      label: "Process Management",
      icon: "settings_suggest",
      route: "/processes",
    },
    // {
    //   label: 'Process Analysis',
    //   icon: 'analytics',
    //   route: '/analysis'
    // },
    {
      label: "Process Dynamics",
      icon: "dynamic_feed",
      route: "/process-dynamics",
    },
    {
      label: "Database Supervision",
      icon: "storage",
      route: "/database",
    },
    {
      label: "Administration",
      icon: "admin_panel_settings",
      route: "/admin",
    },
    // {
    //   label: 'Task Management',
    //   icon: 'task',
    //   route: '/task'
    // },
    {
      label: "User Tasks",
      icon: "assignment_ind",
      route: "/task-users",
    },
  ];

  @Input() isVisible: boolean = true;

  constructor(private authService: AuthService) {}

  ngOnInit() {}

  onLogout() {
    this.authService.logout();
  }
}
