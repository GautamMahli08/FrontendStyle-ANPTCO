import { Order, Truck, TruckAssignment, Ticket, KYCDocument, OrderStatus, TruckStatus, TicketStatus, KYCStatus } from '@/src/types';

export class WorkflowSimulator {
  private listeners: Map<string, Function[]> = new Map();

  on(event: string, callback: Function) {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, []);
    }
    this.listeners.get(event)?.push(callback);
  }

  emit(event: string, data: any) {
    this.listeners.get(event)?.forEach(callback => callback(data));
  }

  // Seller accepts order
  acceptOrder(orderId: string): Order {
    this.emit('order:accepted', { orderId });
    return { 
      id: orderId, 
      status: 'ACCEPTED' as OrderStatus,
    } as Order;
  }

  // Seller assigns order to TSP
  assignOrderToTSP(orderId: string, tspId: string): Order {
    this.emit('order:assigned_to_tsp', { orderId, tspId });
    return {
      id: orderId,
      status: 'ACCEPTED' as OrderStatus,
      assignedTSPId: tspId,
    } as Order;
  }

  // TSP assigns trucks to order
  assignTrucksToOrder(orderId: string, assignments: TruckAssignment[]): Order {
    this.emit('order:trucks_assigned', { orderId, assignments });
    return {
      id: orderId,
      status: 'TRUCKS_ASSIGNED' as OrderStatus,
      assignedTrucks: assignments,
    } as Order;
  }

  // Platform admin resolves sensor integration ticket
  resolveSensorIntegration(ticketId: string, truckId: string, deviceId: string, qrCodeUrl: string): { ticket: Ticket, truck: Truck } {
    this.emit('ticket:resolved', { ticketId, truckId });
    this.emit('truck:sensor_integrated', { truckId, deviceId, qrCodeUrl });
    
    return {
      ticket: { id: ticketId, status: 'RESOLVED' as TicketStatus } as Ticket,
      truck: { 
        id: truckId, 
        status: 'IDLE' as TruckStatus,
        galileoskyDeviceId: deviceId,
        qrCodeUrl,
      } as Truck,
    };
  }

  // Seller approves KYC
  approveKYC(documentId: string, sellerId: string): KYCDocument {
    this.emit('kyc:approved', { documentId, sellerId });
    return {
      id: documentId,
      reviewStatus: 'APPROVED' as KYCStatus,
      reviewedBy: sellerId,
      reviewedAt: new Date(),
    } as KYCDocument;
  }

  // Seller rejects KYC
  rejectKYC(documentId: string, sellerId: string, notes: string): KYCDocument {
    this.emit('kyc:rejected', { documentId, sellerId, notes });
    return {
      id: documentId,
      reviewStatus: 'REJECTED' as KYCStatus,
      reviewNotes: notes,
      reviewedBy: sellerId,
      reviewedAt: new Date(),
    } as KYCDocument;
  }

  // Client accepts delivery
  acceptDelivery(orderId: string, scannedTruckId: string): Order {
    this.emit('delivery:accepted', { orderId, scannedTruckId });
    return {
      id: orderId,
      status: 'DELIVERY_ACCEPTED' as OrderStatus,
    } as Order;
  }

  // Complete offloading
  completeOffloading(orderId: string): Order {
    this.emit('delivery:offloading_complete', { orderId });
    return {
      id: orderId,
      status: 'OFFLOADING_COMPLETE' as OrderStatus,
    } as Order;
  }
}

export const workflowSimulator = new WorkflowSimulator();
