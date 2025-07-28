import { Injectable } from '@angular/core';
import { CompatClient, Stomp } from '@stomp/stompjs';
import { AuthService } from './auth.service';

@Injectable({
  providedIn: 'root'
})
export class NotificationService {
  private stompClient: CompatClient | null = null;

  constructor(private authService: AuthService) {}

  connect(onMessage: (msg: any) => void): void {
    const userId = this.authService.getDecodedToken()?.sub;
    if (!userId) {
      console.error('No user ID found for WebSocket connection.');
      return;
    }

    const socket = new SockJS('http://localhost:8081/ws');
    this.stompClient = Stomp.over(socket);

    this.stompClient.connect({}, () => {
      console.log('Connected to WebSocket');

      this.stompClient?.subscribe(
          `/user/${userId}/queue/notifications`,
          message => {
            if (message.body) {
              onMessage(JSON.parse(message.body));
            }
          }
      );
    }, (error: any) => {
      console.error('STOMP connection error', error);
    });
  }

  disconnect(): void {
    if (this.stompClient && this.stompClient.connected) {
      this.stompClient.disconnect(() => {
        console.log('WebSocket disconnected');
      });
    }
  }
}
