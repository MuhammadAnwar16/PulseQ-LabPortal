import { Injectable, inject, PLATFORM_ID } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { Observable, Subject } from 'rxjs';
import { API_BASE } from '../api.constants';

export interface LabRealtimeMessage {
  type?: string;
  event?: string;
  order_id?: string;
  status?: string;
  data?: any;
  [key: string]: any;
}

interface RoomConnection {
  subject: Subject<LabRealtimeMessage>;
  socket: WebSocket | null;
  reconnectAttempts: number;
  reconnectTimer: ReturnType<typeof setTimeout> | null;
  manualClose: boolean;
  subscriberCount: number;
}

@Injectable({
  providedIn: 'root'
})
export class LabRealtimeService {
  private readonly platformId = inject(PLATFORM_ID);
  private readonly connections = new Map<string, RoomConnection>();
  private readonly maxReconnectDelayMs = 30000;

  connect(room: string): Observable<LabRealtimeMessage> {
    return new Observable<LabRealtimeMessage>(observer => {
      if (!this.isBrowser()) {
        observer.complete();
        return;
      }

      const state = this.ensureRoomState(room);
      state.subscriberCount += 1;

      this.openSocket(room);

      const subscription = state.subject.subscribe(observer);

      return () => {
        subscription.unsubscribe();
        const currentState = this.connections.get(room);
        if (!currentState) {
          return;
        }

        currentState.subscriberCount = Math.max(0, currentState.subscriberCount - 1);
        if (currentState.subscriberCount === 0) {
          this.disconnect(room);
        }
      };
    });
  }

  disconnect(room: string): void {
    const state = this.connections.get(room);
    if (!state) {
      return;
    }

    state.manualClose = true;

    if (state.reconnectTimer) {
      clearTimeout(state.reconnectTimer);
      state.reconnectTimer = null;
    }

    try {
      state.socket?.close();
    } catch {
      // Ignore close errors.
    }

    state.socket = null;
    this.connections.delete(room);
  }

  private ensureRoomState(room: string): RoomConnection {
    let state = this.connections.get(room);
    if (!state) {
      state = {
        subject: new Subject<LabRealtimeMessage>(),
        socket: null,
        reconnectAttempts: 0,
        reconnectTimer: null,
        manualClose: false,
        subscriberCount: 0
      };
      this.connections.set(room, state);
    }

    state.manualClose = false;
    return state;
  }

  private openSocket(room: string): void {
    const state = this.connections.get(room);
    if (!state || state.socket?.readyState === WebSocket.OPEN || state.socket?.readyState === WebSocket.CONNECTING) {
      return;
    }

    const wsUrl = this.buildSocketUrl(room);
    if (!wsUrl) {
      return;
    }

    const socket = new WebSocket(wsUrl);
    state.socket = socket;

    socket.onopen = () => {
      state.reconnectAttempts = 0;
    };

    socket.onmessage = (event: MessageEvent) => {
      const raw = typeof event.data === 'string' ? event.data : '';

      if (!raw) {
        return;
      }

      try {
        state.subject.next(JSON.parse(raw) as LabRealtimeMessage);
      } catch {
        state.subject.next({ type: 'message', data: raw });
      }
    };

    socket.onerror = () => {
      // Reconnect handled onclose
    };

    socket.onclose = () => {
      state.socket = null;

      if (state.manualClose || state.subscriberCount === 0) {
        return;
      }

      this.scheduleReconnect(room);
    };
  }

  private scheduleReconnect(room: string): void {
    const state = this.connections.get(room);
    if (!state || state.manualClose || state.subscriberCount === 0) {
      return;
    }

    if (state.reconnectTimer) {
      return;
    }

    state.reconnectAttempts += 1;
    const delay = Math.min(1000 * Math.pow(2, state.reconnectAttempts - 1), this.maxReconnectDelayMs);

    state.reconnectTimer = setTimeout(() => {
      const currentState = this.connections.get(room);
      if (!currentState || currentState.manualClose || currentState.subscriberCount === 0) {
        return;
      }

      currentState.reconnectTimer = null;
      this.openSocket(room);
    }, delay);
  }

  private buildSocketUrl(room: string): string | null {
    if (!this.isBrowser()) {
      return null;
    }

    const apiUrl = API_BASE.replace(/\/$/, '');
    const wsBaseUrl = apiUrl.startsWith('https://')
      ? apiUrl.replace('https://', 'wss://')
      : apiUrl.replace('http://', 'ws://');

    return `${wsBaseUrl}/staff/laboratory/ws?room=${encodeURIComponent(room)}`;
  }

  private isBrowser(): boolean {
    return isPlatformBrowser(this.platformId);
  }
}
