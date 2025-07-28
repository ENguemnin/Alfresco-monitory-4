import { Injectable } from '@angular/core';
import {BehaviorSubject, Observable, of, throwError, timer} from 'rxjs';
import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { map, switchMap, catchError } from 'rxjs/operators';
import { Router } from '@angular/router';
import {s} from "@angular/cdk/scrolling-module.d-ud2XrbF8";
import {jwtDecode} from "jwt-decode";
import { environment } from '../../../environments/environment';

interface TokenResponse {
  access_token: string;
  refresh_token: string;
  expires_in: number;
}

@Injectable({ providedIn: 'root' })
export class AuthService {
  private tokenExpiryTimer?: any;
  private currentUserSubject = new BehaviorSubject<TokenResponse | null>(null);
  // public currentUser = this.currentUserSubject.asObservable();
  //
  // private tokenUrl = 'http://localhost:8085/realms/aps-realm/protocol/openid-connect/token';
  // private clientId = 'aps';
  // private clientSecret = 'O8EqOMlzrUKWlM3BO0NbMzIBoRRLEsL0'; // Replace with real secret
  // private  scope = 'openid roles';
  constructor(private http: HttpClient, private router: Router) {
    const saved = localStorage.getItem('auth_tokens');
    if (saved) this.currentUserSubject.next(JSON.parse(saved));
  }

    login(username: string, password: string): Observable<TokenResponse> {
        const loginPayload = { username, password };

        return this.http
            .post<TokenResponse>(`${environment.api2Url}/users/login`, loginPayload)
            .pipe(
                map(tokens => {
                    this.storeTokens(tokens);
                    this.storeCredentials(username, password);
                    this.scheduleRefresh(tokens.expires_in);
                    return tokens;
                }),

                catchError((err: HttpErrorResponse) => throwError(() => err))
            );

    }

    private storeCredentials(email: string, password: string): void {
        localStorage.setItem('user_email', email);
        localStorage.setItem('user_password', password);
    }
    getBasicAuthHeader(): string | null {
        const email = localStorage.getItem('user_email');
        const password = localStorage.getItem('user_password');
        if (!email || !password) return null;
        return 'Basic ' + btoa(`${email}:${password}`);
    }


    logout() {
        const current = this.currentUserSubject.value;
        if (!current) {
            this.clearSession();
            return;
        }

        const body = { refreshToken: current.refresh_token };

        this.http.post(`${environment.api2Url}/users/logout`, body).subscribe({
            next: () => {
                this.clearSession();
                this.router.navigate(['/login']);
            },
            error: err => {
                console.error('Logout API failed:', err);
                this.clearSession(); // fallback cleanup
                this.router.navigate(['/login']);
            }

        });

    }
    get accessToken(): string | null {
        return this.currentUserSubject.value?.access_token ?? null;
    }

    private clearSession() {
        localStorage.removeItem('auth_tokens');
        localStorage.removeItem('user_email');
        localStorage.removeItem('user_password');
        this.currentUserSubject.next(null);
        clearTimeout(this.tokenExpiryTimer);
    }


    private storeTokens(tokens: TokenResponse) {
    localStorage.setItem('auth_tokens', JSON.stringify(tokens));
    this.currentUserSubject.next(tokens);
  }

  private scheduleRefresh(expiresInSec: number) {
    if (this.tokenExpiryTimer) clearTimeout(this.tokenExpiryTimer);
    const refreshTime = (expiresInSec - 60) * 1000;
    // this.tokenExpiryTimer = setTimeout(() => this.refreshToken().subscribe(), refreshTime);
  }

  // refreshToken(): Observable<TokenResponse> {
  //   const current = this.currentUserSubject.value;
  //   if (!current) return throwError(() => new Error('No token to refresh'));
  //
  //   const body = new URLSearchParams({
  //     grant_type: 'refresh_token',
  //     client_id: this.clientId,
  //     client_secret: this.clientSecret,
  //     refresh_token: current.refresh_token,
  //   });
  //
  //   return this.http
  //       .post<TokenResponse>(this.tokenUrl, body.toString(), {
  //         headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
  //       })
  //       .pipe(
  //           map(tokens => {
  //             this.storeTokens(tokens);
  //             this.scheduleRefresh(tokens.expires_in);
  //             return tokens;
  //           }),
  //           catchError(err => {
  //             this.logout();
  //             return throwError(() => err);
  //           })
  //       );
  // }

  isLoggedIn(): boolean {
    return !!this.currentUserSubject.value?.access_token;
  }
    getDecodedToken(): any | null {
        const accessToken = this.accessToken;
        if (!accessToken) return null;
        try {
            return jwtDecode(accessToken);
        } catch (e) {
            return null;
        }
    }
}
