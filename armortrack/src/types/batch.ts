export type BatchStatus = 'PENDING' | 'PENDING_PICKUP' | 'ACCEPTED' | 'IN_TRANSIT' | 'DELIVERED' | 'CANCELLED';

export interface Batch {
  id: string;
  batchCode?: string;
  assetsCount: number;
  transporter?: string;
  status: BatchStatus;
  destination: string;
  createdAt: string;
  driverName?: string;
  qrGenerated?: boolean;
  createdBy?: string;
  assets?: BatchAsset[];
}

export interface BatchAsset {
  assetId: string;
  assetName: string;
  scanStatus: 'SCANNED' | 'NOT_SCANNED';
}

export interface CreateBatchInput {
  assetIds: string[];
  transporterId?: string;
  destination: string;
  expectedDelivery: string;
}
