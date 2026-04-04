export interface Asset {
  id: string;
  name: string;
  type: string;
  status: 'WAREHOUSE' | 'WAREHOUSE_RECEIVED' | 'IN_TRANSIT' | 'DEPLOYED' | 'MAINTENANCE_DUE' | 'CHECKED_OUT' | 'MAINTENANCE';
  currentCustodian: string;
  lastUpdated: string;
}

export interface RegisterAssetInput {
  name: string;
  type: string;
}
