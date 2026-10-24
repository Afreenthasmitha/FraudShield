export type Risk = "Low" | "Medium" | "High" | "Critical";

export interface Signal {
  key: string;
  label: string;
  strength: number;
  detail: string;
}

export interface Transaction {
  id: string;
  timestamp: string;
  sender: string;
  recipient: string;
  amount: number;
  currency: string;
  channel: string;
  region: string;
  status: string;
  risk_score: number;
  risk_probability: number | null;
  risk_category: Risk;
  signals: Signal[];
  explanation: string;
  model_source: string;
  features: Record<string, number>;
}

export interface Overview {
  total_transactions: number;
  flagged_transactions: number;
  flag_rate: number;
  volume: number;
  average_risk: number;
  risk_distribution: { name: Risk; value: number }[];
  trend: { date: string; transactions: number; flagged: number }[];
  channel_distribution: { name: string; value: number }[];
  regional_risk: { region: string; transactions: number; average_risk: number }[];
  customer_risk: { account: string; transactions: number; average_risk: number }[];
  recent_alerts: Transaction[];
}

export interface ModelInsights {
  status: string;
  algorithm: string;
  training_rows?: number;
  test_rows?: number;
  positive_test_rows?: number;
  accuracy?: number;
  precision?: number;
  recall?: number;
  f1?: number;
  roc_auc?: number;
  confusion_matrix?: number[][];
  split?: string;
  note?: string;
  reason?: string;
  dataset_rows: number;
  label_note: string;
  features: { feature: string; importance: number }[];
}

export interface Investigation {
  id: string;
  title: string;
  status: "Open" | "In Review" | "Escalated" | "Closed";
  priority: Risk;
  transaction_ids: string[];
  notes: { at: string; author: string; text: string }[];
  evidence: { transaction_id: string; description: string; at: string }[];
  timeline: { at: string; event: string }[];
  created_at: string;
  updated_at: string;
}

export interface AppSettings {
  thresholds: { low_max: number; medium_max: number; high_max: number };
  weights: Record<string, number>;
}

export interface NetworkData {
  nodes: { id: string; risk: number; transactions: number }[];
  edges: {
    id: string;
    source: string;
    target: string;
    amount: number;
    risk: number;
    category: Risk;
    selected: boolean;
  }[];
  selected_transaction: string;
}
