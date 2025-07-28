// system-stats.service.ts

import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import {ProcessStatusCount, SystemStats} from "../models/system-stats.model";

@Injectable({ providedIn: 'root' })
export class SystemStatsService {
  constructor(private http: HttpClient) {}

  getSystemStats(): Observable<SystemStats> {
    return this.http.get<SystemStats>('http://localhost:8082/api/system/stats');
  }



  getThresholds(): Observable<{ thresholdDays: number; process_thresholdDays: number }> {
    return this.http.get<{ thresholdDays: number; process_thresholdDays: number }>(
        'http://localhost:8082/api/config/thresholds'
    );
  }

  updateThresholds(inactivityDays: number, processDays: number): Observable<string> {
    return this.http.put(
        'http://localhost:8082/api/config/thresholds',
        null,
        {
          params: { inactivityDays, processDays },
          responseType: 'text'
        }
    );
  }
}
