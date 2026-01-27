import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  OnGatewayConnection,
  OnGatewayDisconnect,
  MessageBody,
  ConnectedSocket,
} from '@nestjs/websockets';
import { Logger, UseGuards } from '@nestjs/common';
import { Server, Socket } from 'socket.io';
import { JwtService } from '@nestjs/jwt';
import { UserService } from 'src/user/user.service';

@WebSocketGateway({
  cors: {
    origin: ['http://localhost:3000', 'http://localhost:3001'],
    credentials: true,
  },
  namespace: '/device',
})
export class DeviceGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server: Server;

  private readonly logger = new Logger(DeviceGateway.name);
  private connectedClients: Map<string, string> = new Map(); // socketId -> userId

  constructor(
    private readonly jwtService: JwtService,
    private readonly userService: UserService,
  ) {}

  async handleConnection(client: Socket) {
    try {
      const token = client.handshake.auth.token || client.handshake.headers.authorization?.replace('Bearer ', '');

      if (!token) {
        this.logger.warn(`Client ${client.id} connected without token`);
        client.disconnect();
        return;
      }

      const payload = this.jwtService.verify(token, {
        secret: process.env.JWT_ACCESS_SECRET,
      });

      const user = await this.userService.findOne(payload.id);

      if (user.tokenVersion !== payload.tokenVersion) {
        this.logger.warn(`Client ${client.id} token revoked`);
        client.emit('error', { message: 'Token has been revoked' });
        client.disconnect();
        return;
      }

      this.connectedClients.set(client.id, payload.id);
      client.data.userId = payload.id;

      this.logger.log(`Client connected: ${client.id} (User: ${payload.id})`);

      // Send connection confirmation
      client.emit('connected', {
        message: 'Connected to device WebSocket',
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      this.logger.error('Authentication error:', error);
      client.emit('error', { message: 'Authentication failed' });
      client.disconnect();
    }
  }

  handleDisconnect(client: Socket) {
    const userId = this.connectedClients.get(client.id);
    this.connectedClients.delete(client.id);
    this.logger.log(`Client disconnected: ${client.id} (User: ${userId})`);
  }

  /**
   * Mobile app subscribes to device updates
   */
  @SubscribeMessage('subscribeToDevice')
  handleSubscribeToDevice(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { deviceId: string },
  ) {
    const { deviceId } = data;
    const room = `device:${deviceId}`;
    
    client.join(room);
    this.logger.log(`Client ${client.id} subscribed to device ${deviceId}`);
    
    return {
      event: 'subscribed',
      data: { deviceId, room },
    };
  }

  /**
   * Mobile app unsubscribes from device updates
   */
  @SubscribeMessage('unsubscribeFromDevice')
  handleUnsubscribeFromDevice(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { deviceId: string },
  ) {
    const { deviceId } = data;
    const room = `device:${deviceId}`;
    
    client.leave(room);
    this.logger.log(`Client ${client.id} unsubscribed from device ${deviceId}`);
    
    return {
      event: 'unsubscribed',
      data: { deviceId },
    };
  }

  /**
   * Mobile app sends command to device
   */
  @SubscribeMessage('sendCommand')
  handleSendCommand(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { deviceId: string; command: string; params: any },
  ) {
    this.logger.log(`Command from client ${client.id}:`, data);
    
    // This will be handled by the sync service
    return {
      event: 'commandQueued',
      data: {
        deviceId: data.deviceId,
        command: data.command,
        timestamp: new Date().toISOString(),
      },
    };
  }

  /**
   * Broadcast device data update to all subscribed mobile clients
   */
  broadcastDeviceData(deviceId: string, data: any) {
    const room = `device:${deviceId}`;
    this.server.to(room).emit('deviceData', {
      deviceId,
      data,
      timestamp: new Date().toISOString(),
    });
    
    this.logger.debug(`Broadcasted data to ${room}:`, data);
  }

  /**
   * Broadcast device status update
   */
  broadcastDeviceStatus(deviceId: string, status: any) {
    const room = `device:${deviceId}`;
    this.server.to(room).emit('deviceStatus', {
      deviceId,
      status,
      timestamp: new Date().toISOString(),
    });
    
    this.logger.debug(`Broadcasted status to ${room}:`, status);
  }

  /**
   * Send message to specific user
   */
  sendToUser(userId: string, event: string, data: any) {
    const socketIds = Array.from(this.connectedClients.entries())
      .filter(([_, uid]) => uid === userId)
      .map(([socketId, _]) => socketId);

    socketIds.forEach(socketId => {
      this.server.to(socketId).emit(event, data);
    });
  }

  /**
   * Broadcast to all connected clients
   */
  broadcast(event: string, data: any) {
    this.server.emit(event, data);
  }
}
