import { Component, OnInit, ViewChild } from "@angular/core";
import { CommonModule } from "@angular/common";
import { FormsModule } from "@angular/forms";
import { UserService } from "../../core/services/user.service";
import { User, AuditLog } from "../../core/models/user.model";
import { MatTableDataSource } from "@angular/material/table";
import { MatPaginator } from "@angular/material/paginator";
import { MatSort } from "@angular/material/sort";
import { MatFormFieldModule } from "@angular/material/form-field";
import { MatInputModule } from "@angular/material/input";
import { MatIconModule } from "@angular/material/icon";
import { MatButtonModule } from "@angular/material/button";
import { MatTooltipModule } from "@angular/material/tooltip";
import { MatTabsModule } from "@angular/material/tabs";
import { MatTableModule } from "@angular/material/table";
import { MatPaginatorModule } from "@angular/material/paginator";
import { HttpClient, HttpHeaders } from "@angular/common/http";
import { Router } from "@angular/router";
import { environment } from '../../../environments/environment';

export interface InactiveUser {
  userId: string;
  username: string;
  fullName: string;
  email: string;
  enabled: boolean;
  lastLoginTime: string | null;
}

@Component({
  selector: "app-admin",
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    MatFormFieldModule,
    MatInputModule,
    MatIconModule,
    MatButtonModule,
    MatTooltipModule,
    MatTabsModule,
    MatTableModule,
    MatPaginatorModule,
  ],
  templateUrl: "./admin.component.html",
  styleUrls: ["./admin.component.scss"],
})
export class AdminComponent implements OnInit {
  activeTab = "users";
  users: User[] = [];
  auditLogs: AuditLog[] = [];
  loading = true;

  activeUserTabIndex = 0;
  userTabs = [
    { label: "Tous", key: "all", count: 0 },
    { label: "Actifs", key: "active", count: 0 },
    { label: "Inactifs", key: "inactive", count: 0 },
  ];

  userDataSourceAll = new MatTableDataSource<User>([]);
  userDataSourceActive = new MatTableDataSource<User>([]);
  inactiveUsers: InactiveUser[] = [];
  userDataSourceInactive = new MatTableDataSource<InactiveUser>([]);

  userDisplayedColumns: string[] = [
    "username",
    "name",
    "email",
    "Enable",
    "lastLogin",
    "isActive",
    "actions",
  ];
  userDisplayedColumnsInactive: string[] = [
    "username",
    "fullName",
    "email",
    "enabled",
    "lastLoginTime",
    "actions",
  ];

  @ViewChild(MatPaginator) paginator!: MatPaginator;
  @ViewChild(MatSort) sort!: MatSort;

  constructor(
    private userService: UserService,
    private http: HttpClient,
    private router: Router
  ) {}

  ngOnInit(): void {
    this.loadData();
    this.loadInactiveUsers();
  }

  ngAfterViewInit(): void {
    // Pour le tri/pagination sur le premier onglet (Tous)
    this.userDataSourceAll.paginator = this.paginator;
    this.userDataSourceAll.sort = this.sort;
    // Pour les autres onglets, tu peux ajouter d'autres ViewChild si besoin
  }

  loadData(): void {
    this.loading = true;

    this.userService.getUsers().subscribe((users) => {
      this.users = users;
      this.userDataSourceAll.data = users;
      this.userDataSourceActive.data = users.filter((u) => u.isActive);

      this.userTabs[0].count = users.length;
      this.userTabs[1].count = this.userDataSourceActive.data.length;
      // Remove assignment for inactive users here

      this.loading = false;
    });

    this.userService.getAuditLogs().subscribe((logs) => {
      this.auditLogs = logs;
    });
  }

  loadInactiveUsers(): void {
    const token = localStorage.getItem('auth_tokens')
      ? JSON.parse(localStorage.getItem('auth_tokens')!).access_token
      : null;
    const headers = token
      ? new HttpHeaders({ Authorization: `Bearer ${token}` })
      : undefined;

    this.http
      .get<InactiveUser[]>(
        `${environment.api2Url}/inactive-users`,
        { headers }
      )
      .subscribe((users) => {
        this.inactiveUsers = users;
        this.userDataSourceInactive.data = users;
        this.userTabs[2].count = users.length;
      });
  }

  onUserTabChange(event: any): void {
    this.activeUserTabIndex = event.index;
    // Optionally reset filters on tab change
    // this.applyUserFilter('', this.userTabs[event.index].key);
  }

  setActiveTab(tab: string): void {
    this.activeTab = tab;
  }

  applyUserFilter(value: string, type: "all" | "active" | "inactive"): void {
    const filterValue = value.trim().toLowerCase();
    if (type === "inactive") {
      this.userDataSourceInactive.filter = filterValue;
      this.userDataSourceInactive.paginator?.firstPage();
    }
    // ...existing code...
  }
  // ...existing code...

  viewUserTasks(email: string): void {
    this.router.navigate(['/task-users'], { queryParams: { userEmail: email } });
  }
}
