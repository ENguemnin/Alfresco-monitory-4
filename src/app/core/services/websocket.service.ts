import { Injectable } from '@angular/core';
import { Client, IMessage } from '@stomp/stompjs';
import { Observable, Subject } from 'rxjs';

// Import SockJS correctly using default import
import SockJS from 'sockjs-client';

@Injectable({ providedIn: 'root' })
export class WebSocketService {
  private client: Client;
  private notificationSubject = new Subject<any>();
  private connectionSubject = new Subject<boolean>();

  public notifications$ = this.notificationSubject.asObservable();
  public connectionStatus$ = this.connectionSubject.asObservable();

  constructor() {
    this.client = new Client({
      // Configuration options
      reconnectDelay: 5000,
      heartbeatIncoming: 4000,
      heartbeatOutgoing: 4000,

      // Debugging
      debug: (str) => {
        console.log('STOMP: ' + str);
      }
    });
  }

  connect(endpoint: string, userId: string): Observable<boolean> {
    return new Observable(observer => {
      // Configure the WebSocket factory with proper SockJS import
      this.client.webSocketFactory = () => {
        return new SockJS(endpoint) as any; // Type assertion for compatibility
      };

      this.client.onConnect = (frame) => {
        console.log('Connected: ' + frame);
        this.connectionSubject.next(true);

        // Subscribe to user-specific notifications
        this.client.subscribe(
            `/user/${userId}/queue/notifications`,
            (message: IMessage) => {
              try {
                const notification = JSON.parse(message.body);
                this.notificationSubject.next(notification);
              } catch (e) {
                console.error('Error parsing notification:', e);
              }
            }
        );

        observer.next(true);
        observer.complete();
      };

      this.client.onStompError = (frame) => {
        console.error('Broker reported error: ' + frame.headers['message']);
        this.connectionSubject.next(false);
        observer.error(frame);
      };

      this.client.onWebSocketError = (event) => {
        console.error('WebSocket error:', event);
        this.connectionSubject.next(false);
        observer.error(event);
      };

      this.client.activate();
    });
  }

  send(destination: string, body: any): void {
    if (this.client.connected) {
      this.client.publish({
        destination,
        body: JSON.stringify(body)
      });
    } else {
      console.warn('Cannot send message - not connected');
    }
  }

  disconnect(): void {
    if (this.client.connected) {
      this.client.deactivate();
    }
  }
}