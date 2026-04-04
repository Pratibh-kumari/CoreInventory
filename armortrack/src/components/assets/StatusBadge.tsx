"use client";

interface StatusBadgeProps {
  status: 'WAREHOUSE' | 'WAREHOUSE_RECEIVED' | 'IN_TRANSIT' | 'DEPLOYED' | 'MAINTENANCE_DUE' | 'CHECKED_OUT' | 'MAINTENANCE';
}

const statusConfig = {
  WAREHOUSE: { color: 'badge-ghost', label: 'Warehouse' },
  WAREHOUSE_RECEIVED: { color: 'badge-success', label: 'Warehouse Received' },
  IN_TRANSIT: { color: 'badge-warning', label: 'In Transit' },
  DEPLOYED: { color: 'badge-info', label: 'Deployed' },
  MAINTENANCE_DUE: { color: 'badge-error', label: 'Maintenance Due' },
  CHECKED_OUT: { color: 'badge-accent', label: 'Checked Out' },
  MAINTENANCE: { color: 'badge-error', label: 'Maintenance' },
};

export default function StatusBadge({ status }: StatusBadgeProps) {
  const config = statusConfig[status] || statusConfig.WAREHOUSE;
  
  return (
    <span className={`badge ${config.color} badge-sm font-semibold uppercase tracking-wider`}>
      {config.label}
    </span>
  );
}
