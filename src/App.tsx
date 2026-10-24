import {
  Activity, AlertOctagon, AlertTriangle, ArrowUpRight, Bell,
  BrainCircuit, BriefcaseBusiness, Check, ChevronDown, ChevronLeft, ChevronRight,
  CircleHelp, Download, Eye, FileBarChart2, Filter, Fingerprint, Gauge,
  GitBranch, LayoutDashboard, LoaderCircle, LockKeyhole, Menu, MoreHorizontal,
  Plus, RefreshCw, Search, Settings2, Shield, ShieldAlert, ShieldCheck,
  SlidersHorizontal, Sparkles, Target, TrendingUp, WalletCards, X, Zap,
} from "lucide-react";
import {
  Area, AreaChart, Bar, BarChart, CartesianGrid, Cell, Pie, PieChart,
  ResponsiveContainer, Tooltip, XAxis, YAxis,
} from "recharts";
import {
  useCallback, useEffect, useMemo, useRef, useState,
  type CSSProperties, type FormEvent, type PointerEvent as ReactPointerEvent,
  type ReactNode, type WheelEvent,
} from "react";
import { request } from "./api";
import type {
  AppSettings, Investigation, ModelInsights, NetworkData, Overview, Risk, Transaction,
} from "./types";

type Page = "Overview" | "Live Transactions" | "Fraud Network" | "AI Model Insights" |
  "Investigations" | "Reports" | "Settings";

const NAV: { label: Page; icon: typeof LayoutDashboard; group: string }[] = [
  { label: "Overview", icon: LayoutDashboard, group: "WORKSPACE" },
  { label: "Live Transactions", icon: Activity, group: "WORKSPACE" },
  { label: "Fraud Network", icon: GitBranch, group: "WORKSPACE" },
  { label: "AI Model Insights", icon: BrainCircuit, group: "INTELLIGENCE" },
  { label: "Investigations", icon: BriefcaseBusiness, group: "INTELLIGENCE" },
  { label: "Reports", icon: FileBarChart2, group: "MANAGE" },
  { label: "Settings", icon: Settings2, group: "MANAGE" },
];

const COLORS: Record<Risk, string> = {
  Low: "#38d9a9", Medium: "#f3c969", High: "#ff9e58", Critical: "#ff647c",
};
const PIE_COLORS = ["#39d9a8", "#44b7d4", "#f0bf57", "#ff647c"];
const WEIGHT_NAMES: Record<string, string> = {
  amount: "Unusual amount",
  velocity: "Transaction velocity",
  new_recipient: "First-seen recipient",
  rapid_transfer: "Rapid transfer pattern",
  night_transaction: "Overnight activity",
  international: "Cross-border indicator",
};
const fmtMoney = (amount: number) => new Intl.NumberFormat("en-US", {
  style: "currency", currency: "USD", maximumFractionDigits: 0,
}).format(amount);
const fmtDate = (value: string, options?: Intl.DateTimeFormatOptions) =>
  new Date(value).toLocaleString([], options ?? { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });

function RiskBadge({ risk }: { risk: Risk }) {
  return <span className={`risk-badge risk-${risk.toLowerCase()}`}><i />{risk}</span>;
}

function Panel({
  title, subtitle, action, children, className = "",
}: {
  title: string; subtitle?: string; action?: ReactNode; children: ReactNode; className?: string;
}) {
  return <section className={`panel ${className}`}>
    <div className="panel-heading">
      <div><h2>{title}</h2>{subtitle && <p>{subtitle}</p>}</div>
      {action}
    </div>
    {children}
  </section>;
}

function MetricCard({
  icon: Icon, label, value, detail, change, color = "cyan",
}: {
  icon: typeof Activity; label: string; value: string; detail: string; change?: string; color?: string;
}) {
  return <article className={`metric-card metric-${color}`}>
    <div className="metric-top"><span className="metric-icon"><Icon size={17} /></span>
      {change && <span className="metric-change"><ArrowUpRight size={13} />{change}</span>}</div>
    <div className="metric-value">{value}</div>
    <div className="metric-label">{label}</div>
    <div className="metric-detail">{detail}</div>
  </article>;
}

function EmptyState({ icon: Icon = CircleHelp, title, detail }: {
  icon?: typeof CircleHelp; title: string; detail: string;
}) {
  return <div className="empty-state"><Icon size={25} /><strong>{title}</strong><span>{detail}</span></div>;
}

function OverviewPage({
  data, openTransaction, goTo,
}: {
  data: Overview; openTransaction: (transaction: Transaction) => void; goTo: (page: Page) => void;
}) {
  const flagged = data.flagged_transactions;
  return <div className="page-content">
    <div className="page-intro">
    <div><div className="eyebrow"><span className="pulse-dot" /> DEMO RISK OPERATIONS</div>
        <h1>Good afternoon, Analyst</h1>
        <p>Your fraud operations overview, powered by one consistent synthetic demo stream.</p></div>
      <button className="button button-secondary" onClick={() => goTo("Live Transactions")}><Activity size={15} />View transactions</button>
    </div>
    <div className="metric-grid">
      <MetricCard icon={WalletCards} label="Transactions monitored" value={data.total_transactions.toLocaleString()} detail="Deterministic synthetic dataset" change="DEMO" />
      <MetricCard icon={ShieldAlert} label="Elevated risk" value={flagged.toLocaleString()} detail={`${data.flag_rate}% of modeled transactions`} color="orange" />
      <MetricCard icon={TrendingUp} label="Monitored volume" value={fmtMoney(data.volume)} detail="Aggregated demo transaction value" color="blue" />
      <MetricCard icon={Gauge} label="Average risk score" value={`${data.average_risk} / 100`} detail="Current configured score distribution" color="purple" />
    </div>
    <div className="overview-grid">
      <Panel title="Transaction risk activity" subtitle="Synthetic records · held consistently across the dashboard" className="trend-panel"
        action={<span className="chart-legend"><i className="legend-cyan" />Transactions <i className="legend-orange" />Elevated risk</span>}>
        <div className="chart-wrap trend-chart">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={data.trend} margin={{ top: 10, right: 8, left: -18, bottom: 0 }}>
              <defs>
                <linearGradient id="txFill" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#27c9de" stopOpacity={0.24} /><stop offset="98%" stopColor="#27c9de" stopOpacity={0} /></linearGradient>
                <linearGradient id="riskFill" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#ff9e58" stopOpacity={0.2} /><stop offset="98%" stopColor="#ff9e58" stopOpacity={0} /></linearGradient>
              </defs>
              <CartesianGrid stroke="#1b2b40" strokeDasharray="3 5" vertical={false} />
              <XAxis dataKey="date" tickFormatter={(d: string) => new Date(d).toLocaleDateString([], { month: "short", day: "numeric" })} tick={{ fill: "#72849a", fontSize: 10 }} tickLine={false} axisLine={false} minTickGap={28} />
              <YAxis tick={{ fill: "#72849a", fontSize: 10 }} tickLine={false} axisLine={false} />
              <Tooltip contentStyle={{ background: "#101e30", border: "1px solid #263b54", borderRadius: 8, color: "#e8f0f8", fontSize: 12 }} labelFormatter={(d) => new Date(String(d)).toLocaleDateString()} />
              <Area type="monotone" dataKey="transactions" name="Transactions" stroke="#2dcadd" strokeWidth={2} fill="url(#txFill)" />
              <Area type="monotone" dataKey="flagged" name="Elevated risk" stroke="#ff9e58" strokeWidth={1.7} fill="url(#riskFill)" />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </Panel>
      <Panel title="Risk distribution" subtitle="Score categories · 0–100">
        <div className="distribution-layout">
          <div className="donut-wrap"><ResponsiveContainer width="100%" height="100%">
            <PieChart><Pie data={data.risk_distribution} dataKey="value" nameKey="name" innerRadius={62} outerRadius={86} paddingAngle={4} stroke="none">
              {data.risk_distribution.map((entry, index) => <Cell key={entry.name} fill={PIE_COLORS[index]} />)}
            </Pie><Tooltip contentStyle={{ background: "#101e30", border: "1px solid #263b54", borderRadius: 8 }} /></PieChart>
          </ResponsiveContainer><div className="donut-center"><strong>{data.total_transactions.toLocaleString()}</strong><span>records</span></div></div>
          <div className="risk-legend">{data.risk_distribution.map((entry, index) => <div key={entry.name}><span><i style={{ background: PIE_COLORS[index] }} />{entry.name}</span><strong>{entry.value}</strong></div>)}</div>
        </div>
      </Panel>
      <Panel title="Regional risk heatmap" subtitle="Synthetic account regions · average modeled risk" className="heat-panel"
        action={<span className="data-tag"><span className="pulse-dot" /> DEMO DATA</span>}>
        <div className="regional-grid">
          {data.regional_risk.map((region) => {
            const color = region.average_risk >= 60 ? "hot" : region.average_risk >= 40 ? "warm" : "cool";
            return <div className={`region-tile region-${color}`} key={region.region}>
              <div className="region-orb"><span /></div><div className="region-name">{region.region}</div>
              <div className="region-score">{region.average_risk}<small> avg risk</small></div>
              <div className="region-count">{region.transactions.toLocaleString()} transactions</div>
            </div>;
          })}
        </div>
        <div className="region-note"><CircleHelp size={13} /> Fictional regions are randomly assigned to synthetic records; no live location data is used.</div>
      </Panel>
      <Panel title="Channel mix" subtitle="Monitored activity by synthetic channel">
        <div className="chart-wrap channel-chart"><ResponsiveContainer width="100%" height="100%">
          <BarChart data={data.channel_distribution} margin={{ top: 6, right: 4, left: -22, bottom: 0 }}>
            <CartesianGrid stroke="#1b2b40" strokeDasharray="3 5" vertical={false} />
            <XAxis dataKey="name" tick={{ fill: "#8293a8", fontSize: 10 }} tickLine={false} axisLine={false} />
            <YAxis tick={{ fill: "#72849a", fontSize: 10 }} tickLine={false} axisLine={false} />
            <Tooltip contentStyle={{ background: "#101e30", border: "1px solid #263b54", borderRadius: 8 }} />
            <Bar dataKey="value" name="Transactions" fill="#268ca8" radius={[4, 4, 0, 0]} maxBarSize={38} />
          </BarChart>
        </ResponsiveContainer></div>
      </Panel>
      <Panel title="Recent risk alerts" subtitle="Highest modeled risk · click a record to inspect" className="alerts-panel"
        action={<button className="text-button" onClick={() => goTo("Live Transactions")}>All transactions <ChevronRight size={14} /></button>}>
        {data.recent_alerts.length === 0 ? <EmptyState title="No elevated risk" detail="No records meet the current alert threshold." /> :
          <div className="alert-list">{data.recent_alerts.slice(0, 5).map((tx) => <button className="alert-row" key={tx.id} onClick={() => openTransaction(tx)}>
            <span className={`alert-symbol risk-${tx.risk_category.toLowerCase()}`}><AlertTriangle size={15} /></span>
            <span className="alert-copy"><strong>{tx.id} <RiskBadge risk={tx.risk_category} /></strong><small>{tx.sender} → {tx.recipient} · {fmtDate(tx.timestamp)}</small></span>
            <span className="alert-amount">{fmtMoney(tx.amount)}<b>{tx.risk_score}</b></span><ChevronRight size={15} className="muted-icon" />
          </button>)}</div>}
      </Panel>
      <Panel title="Customer risk watchlist" subtitle="Synthetic accounts · highest average transaction risk" className="watchlist-panel">
        <div className="watchlist">{data.customer_risk.slice(0, 5).map((account, index) => <div className="watch-row" key={account.account}>
          <span className="rank">{String(index + 1).padStart(2, "0")}</span><Fingerprint size={16} className="account-icon" />
          <strong>{account.account}</strong><span className="watch-transactions">{account.transactions} txns</span>
          <span className="watch-risk"><i style={{ width: `${account.average_risk}%` }} />{account.average_risk}</span>
        </div>)}</div>
      </Panel>
      <div className="compliance-strip"><span className="compliance-icon"><ShieldCheck size={16} /></span>
        <div><strong>Compliance integrations not configured</strong><span>Demo-only indicators · sanctions screening and regulatory reporting are unavailable.</span></div>
        <span className="not-configured">NOT_CONFIGURED</span>
      </div>
    </div>
  </div>;
}

function TransactionPage({
  transactions, search, setSearch, selectedTransaction, onSelectTransaction, onAnalyze, openNetwork, createCase,
}: {
  transactions: Transaction[]; search: string; setSearch: (value: string) => void;
  selectedTransaction: Transaction | null; onSelectTransaction: (tx: Transaction) => void;
  onAnalyze: (tx: Transaction) => void; openNetwork: (tx: Transaction) => void;
  createCase: (tx: Transaction) => void;
}) {
  const [riskFilter, setRiskFilter] = useState("All risk");
  const [channelFilter, setChannelFilter] = useState("All channels");
  const [page, setPage] = useState(0);
  const [active, setActive] = useState<Transaction | null>(null);
  useEffect(() => { if (selectedTransaction) setActive(selectedTransaction); }, [selectedTransaction]);
  const pageSize = 14;
  const filtered = useMemo(() => transactions.filter((tx) => {
    const query = search.toLowerCase().trim();
    return (!query || [tx.id, tx.sender, tx.recipient].some((value) => value.toLowerCase().includes(query))) &&
      (riskFilter === "All risk" || tx.risk_category === riskFilter) &&
      (channelFilter === "All channels" || tx.channel === channelFilter);
  }), [transactions, search, riskFilter, channelFilter]);
  const pageCount = Math.max(1, Math.ceil(filtered.length / pageSize));
  const pageItems = filtered.slice(page * pageSize, (page + 1) * pageSize);
  function chooseRisk(value: string) { setRiskFilter(value); setPage(0); }
  function chooseChannel(value: string) { setChannelFilter(value); setPage(0); }
  return <div className="page-content">
    <div className="page-intro">
      <div><div className="eyebrow">RISK OPERATIONS / TRANSACTIONS</div><h1>Live transactions</h1>
        <p>Search, triage and analyze records from the persistent demo stream.</p></div>
      <span className="data-tag"><span className="pulse-dot" /> DEMO MODE · {transactions.length.toLocaleString()} RECORDS</span>
    </div>
    <div className="transaction-toolbar">
      <label className="search-field"><Search size={16} /><input value={search} onChange={(e) => { setSearch(e.target.value); setPage(0); }} placeholder="Search ID or account..." /></label>
      <label className="select-field"><Filter size={15} /><select value={riskFilter} onChange={(e) => chooseRisk(e.target.value)}><option>All risk</option>{(["Low", "Medium", "High", "Critical"] as Risk[]).map((risk) => <option key={risk}>{risk}</option>)}</select></label>
      <label className="select-field"><SlidersHorizontal size={15} /><select value={channelFilter} onChange={(e) => chooseChannel(e.target.value)}><option>All channels</option>{["card", "bank_transfer", "wallet", "wire"].map((channel) => <option key={channel} value={channel}>{channel.replace("_", " ")}</option>)}</select></label>
      <span className="results-count">{filtered.length.toLocaleString()} results</span>
    </div>
    <div className={`transaction-layout ${active ? "has-selection" : ""}`}>
      <Panel title="Transaction stream" subtitle="Risk scores are model estimates, not confirmed fraud" className="transaction-panel">
        <div className="table-scroll"><table className="data-table"><thead><tr>
          <th>TRANSACTION</th><th>FROM / TO</th><th>AMOUNT</th><th>CHANNEL</th><th>RISK</th><th>SCORE</th><th></th>
        </tr></thead><tbody>{pageItems.map((tx) => <tr key={tx.id} className={active?.id === tx.id ? "selected-row" : ""} onClick={() => { setActive(tx); onSelectTransaction(tx); }}>
          <td><strong className="mono">{tx.id}</strong><small>{fmtDate(tx.timestamp)}</small></td>
          <td><span className="mono account-cell">{tx.sender}</span><small className="recipient-cell">to {tx.recipient}</small></td>
          <td className="amount-cell">{fmtMoney(tx.amount)}</td><td><span className="channel-pill">{tx.channel.replace("_", " ")}</span></td>
          <td><RiskBadge risk={tx.risk_category} /></td><td><span className={`score-value score-${tx.risk_category.toLowerCase()}`}>{tx.risk_score}</span></td>
          <td><button className="icon-button tiny" aria-label={`Inspect ${tx.id}`} onClick={(e) => { e.stopPropagation(); setActive(tx); onSelectTransaction(tx); }}><Eye size={15} /></button></td>
        </tr>)}</tbody></table>
          {pageItems.length === 0 && <EmptyState title="No matching transactions" detail="Try another search or filter." />}</div>
        <div className="table-footer"><span>Showing {filtered.length ? page * pageSize + 1 : 0}–{Math.min((page + 1) * pageSize, filtered.length)} of {filtered.length.toLocaleString()}</span>
          <div className="pagination"><button className="icon-button tiny" disabled={page === 0} onClick={() => setPage(page - 1)}><ChevronLeft size={15} /></button>
            <span>Page {page + 1} of {pageCount}</span><button className="icon-button tiny" disabled={page + 1 >= pageCount} onClick={() => setPage(page + 1)}><ChevronRight size={15} /></button></div>
        </div>
      </Panel>
      {active && <TransactionDetail transaction={active} onAnalyze={onAnalyze} openNetwork={openNetwork} createCase={createCase} close={() => setActive(null)} />}
    </div>
  </div>;
}

function TransactionDetail({
  transaction, onAnalyze, openNetwork, createCase, close,
}: {
  transaction: Transaction; onAnalyze: (tx: Transaction) => void; openNetwork: (tx: Transaction) => void;
  createCase: (tx: Transaction) => void; close: () => void;
}) {
  const tx = transaction;
  return <aside className="detail-panel panel">
    <div className="detail-heading"><div><span className="eyebrow">TRANSACTION ANALYSIS</span><h2 className="mono">{tx.id}</h2></div><button className="icon-button" onClick={close} aria-label="Close details"><X size={17} /></button></div>
    <div className="score-card"><div className="score-ring" style={{ "--score-color": COLORS[tx.risk_category], "--score-angle": `${tx.risk_score * 3.6}deg` } as CSSProperties}><div><strong>{tx.risk_score}</strong><span>RISK SCORE</span></div></div>
      <div><RiskBadge risk={tx.risk_category} /><p className="score-note">{tx.risk_probability === null ? "Baseline signal score; model probability unavailable." : `Calibrated model probability: ${(tx.risk_probability * 100).toFixed(1)}%.`} Risk score also incorporates configured signal weights.</p></div></div>
    <div className="detail-amount"><span>Transaction amount</span><strong>{fmtMoney(tx.amount)} <small>{tx.currency}</small></strong></div>
    <div className="detail-facts"><div><span>Timestamp</span><strong>{fmtDate(tx.timestamp)}</strong></div><div><span>Channel</span><strong>{tx.channel.replace("_", " ")}</strong></div>
      <div><span>Sender</span><strong className="mono">{tx.sender}</strong></div><div><span>Recipient</span><strong className="mono">{tx.recipient}</strong></div>
      <div><span>Region</span><strong>{tx.region}</strong></div><div><span>Status</span><strong className="capitalize">{tx.status}</strong></div></div>
    <div className="detail-section"><h3>Contributing signals</h3>
      {tx.signals.length === 0 ? <p className="muted-copy">No strong risk indicators found.</p> : tx.signals.map((signal) => <div className="signal-row" key={signal.key}>
        <div><span>{signal.label}</span><small>{signal.detail}</small></div><div className="signal-meter"><i style={{ width: `${signal.strength * 100}%` }} /></div></div>)}
    </div>
    <div className="explanation"><Sparkles size={15} /><p>{tx.explanation}</p></div>
    <div className="detail-actions"><button className="button button-secondary full-width" onClick={() => onAnalyze(tx)}><Zap size={15} />Run analysis</button>
      <button className="button button-secondary full-width" onClick={() => openNetwork(tx)}><GitBranch size={15} />Explore network</button>
      <button className="button button-primary full-width" onClick={() => createCase(tx)}><Plus size={15} />Create investigation</button></div>
  </aside>;
}

function NetworkPage({
  data, load, selectedTransaction, onSelectTransaction, transactions,
}: {
  data: NetworkData | null; load: (id?: string) => void; selectedTransaction: Transaction | null;
  onSelectTransaction: (tx: Transaction) => void; transactions: Transaction[];
}) {
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [drag, setDrag] = useState<{ x: number; y: number; px: number; py: number } | null>(null);
  const [account, setAccount] = useState("");
  useEffect(() => { load(selectedTransaction?.id); }, [load, selectedTransaction?.id]);
  const positions = useMemo(() => {
    const map = new Map<string, { x: number; y: number }>();
    const nodes = data?.nodes ?? [];
    nodes.forEach((node, i) => {
      const angle = (2 * Math.PI * i) / Math.max(nodes.length, 1) - Math.PI / 2;
      const radius = 188 + ((i % 3) - 1) * 16;
      map.set(node.id, { x: 420 + radius * Math.cos(angle), y: 250 + radius * Math.sin(angle) });
    });
    return map;
  }, [data?.nodes]);
  const edges = data?.edges ?? [];
  const visibleNodes = data?.nodes ?? [];
  function onPointerDown(event: ReactPointerEvent<SVGSVGElement>) {
    if ((event.target as Element).closest(".graph-node,.graph-edge")) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    setDrag({ x: event.clientX, y: event.clientY, px: pan.x, py: pan.y });
  }
  function onPointerMove(event: ReactPointerEvent<SVGSVGElement>) {
    if (drag) setPan({ x: drag.px + event.clientX - drag.x, y: drag.py + event.clientY - drag.y });
  }
  function onWheel(event: WheelEvent<SVGSVGElement>) {
    setZoom((value) => Math.min(1.8, Math.max(0.55, value + (event.deltaY < 0 ? 0.08 : -0.08))));
  }
  const activeTx = selectedTransaction;
  return <div className="page-content">
    <div className="page-intro">
      <div><div className="eyebrow">INTELLIGENCE / ACCOUNT RELATIONSHIPS</div><h1>Fraud network</h1><p>Explore directed demo transfers and the accounts connected to a selected transaction.</p></div>
      <span className="data-tag"><span className="pulse-dot" /> SYNTHETIC ACCOUNT GRAPH</span>
    </div>
    <div className="network-stats">
      <MetricCard icon={Fingerprint} label="Connected accounts" value={String(visibleNodes.length)} detail="Fictional account identifiers" color="blue" />
      <MetricCard icon={GitBranch} label="Directed transfers" value={String(edges.length)} detail="Observed transaction relationships" color="cyan" />
      <MetricCard icon={AlertOctagon} label="Elevated-risk edges" value={String(edges.filter((edge) => edge.risk >= 56).length)} detail="Model estimates at or above 56" color="orange" />
    </div>
    <Panel title="Connected accounts" subtitle={activeTx ? `Selected path: ${activeTx.sender} → ${activeTx.recipient} · ${activeTx.id}` : "Drag to pan · scroll to zoom · click a transfer to inspect"} className="graph-panel"
      action={<div className="graph-controls"><button onClick={() => setZoom((value) => Math.min(1.8, value + 0.12))}>+</button><span>{Math.round(zoom * 100)}%</span><button onClick={() => setZoom((value) => Math.max(0.55, value - 0.12))}>−</button><button onClick={() => { setZoom(1); setPan({ x: 0, y: 0 }); }}>Reset</button></div>}>
      {!data ? <div className="graph-loading"><LoaderCircle size={22} className="spin" />Loading graph data…</div> :
        <div className="graph-viewport"><svg viewBox="0 0 840 500" onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={() => setDrag(null)} onPointerCancel={() => setDrag(null)} onWheel={onWheel}>
          <defs><marker id="arrow" markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto"><path d="M0,0 L8,4 L0,8 Z" fill="#51718b" /></marker>
            <marker id="arrow-hot" markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto"><path d="M0,0 L8,4 L0,8 Z" fill="#ff7382" /></marker>
            <filter id="glow"><feGaussianBlur stdDeviation="4" result="blur" /><feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge></filter></defs>
          <g transform={`translate(${pan.x} ${pan.y}) translate(420 250) scale(${zoom}) translate(-420 -250)`}>
            {edges.map((edge, i) => {
              const from = positions.get(edge.source); const to = positions.get(edge.target);
              if (!from || !to) return null;
              const bend = ((i % 5) - 2) * 9;
              const control = { x: (from.x + to.x) / 2 + bend, y: (from.y + to.y) / 2 - bend };
              const hot = edge.selected || edge.risk >= 75 || (account !== "" && (edge.source === account || edge.target === account));
              return <path className={`graph-edge ${hot ? "edge-hot" : ""}`} key={edge.id} d={`M${from.x},${from.y} Q${control.x},${control.y} ${to.x},${to.y}`} markerEnd={hot ? "url(#arrow-hot)" : "url(#arrow)"} onClick={() => {
                const tx = transactions.find((item) => item.id === edge.id);
                if (tx) onSelectTransaction(tx);
              }}><title>{edge.id}: {edge.source} to {edge.target} · {fmtMoney(edge.amount)} · risk {edge.risk}</title></path>;
            })}
            {visibleNodes.map((node) => {
              const point = positions.get(node.id)!;
              const isSelected = activeTx?.sender === node.id || activeTx?.recipient === node.id || account === node.id;
              const fill = node.risk >= 75 ? "#ff657d" : node.risk >= 56 ? "#f2a15b" : node.risk >= 35 ? "#e9c365" : "#40cda8";
              return <g className={`graph-node ${isSelected ? "node-selected" : ""}`} key={node.id} transform={`translate(${point.x} ${point.y})`} onClick={() => setAccount(node.id)}>
                {isSelected && <circle r="20" className="node-halo" />}
                <circle r={6 + Math.min(5, node.transactions * 0.3)} fill={fill} /><text y="23">{node.id.slice(5)}</text>
                <title>{node.id} · {node.transactions} transfers · max risk {node.risk}</title></g>;
            })}
          </g>
        </svg></div>}
      <div className="graph-legend"><span><i className="legend-green" />Lower risk</span><span><i className="legend-yellow" />Medium risk</span><span><i className="legend-orange" />Elevated</span><span><i className="legend-red" />High-risk edge</span>
        {account && <button className="text-button" onClick={() => setAccount("")}>Clear {account} focus <X size={12} /></button>}
      </div>
      <div className="graph-footnote">Each arrow follows the transaction sender → recipient. Risk is an estimate on synthetic records, not a finding of fraud.</div>
    </Panel>
  </div>;
}

function ModelPage({ model }: { model: ModelInsights }) {
  const trained = model.status === "TRAINED";
  const matrix = model.confusion_matrix ?? [[0, 0], [0, 0]];
  const metrics = [
    ["Accuracy", model.accuracy], ["Precision", model.precision], ["Recall", model.recall], ["F1 score", model.f1], ["ROC AUC", model.roc_auc],
  ] as const;
  return <div className="page-content">
    <div className="page-intro"><div><div className="eyebrow">INTELLIGENCE / MODEL TRANSPARENCY</div><h1>AI model insights</h1><p>Evaluation is calculated from held-out synthetic predictions, never hardcoded.</p></div>
      <span className={`model-status ${trained ? "status-trained" : "status-untrained"}`}><span />{trained ? "MODEL TRAINED" : "NOT TRAINED"}</span></div>
    <div className="model-summary panel"><div className="model-icon"><BrainCircuit size={24} /></div><div className="model-copy"><div className="eyebrow">CURRENT SCORING ENGINE</div><h2>{model.algorithm}</h2><p>{trained ? `Trained on ${model.training_rows?.toLocaleString()} deterministic synthetic records with a stratified holdout.` : model.reason}</p></div>
      <div className="model-summary-meta"><div><span>Data mode</span><strong>DEMO ONLY</strong></div><div><span>Dataset</span><strong>{model.dataset_rows.toLocaleString()} rows</strong></div>      <div><span>Test split</span><strong>{model.test_rows?.toLocaleString() ?? "—"} rows</strong></div>
      <div><span>Positive test labels</span><strong>{model.positive_test_rows?.toLocaleString() ?? "—"}</strong></div></div></div>
    {trained && <div className="metric-grid model-metrics">{metrics.map(([label, value]) => <MetricCard key={label} icon={Target} label={label} value={value == null ? "—" : `${(value * 100).toFixed(1)}%`} detail="Held-out demo test set" color={label === "Recall" ? "orange" : "cyan"} />)}</div>}
    <div className="overview-grid model-grid">
      <Panel title="Confusion matrix" subtitle="Held-out test predictions · actual synthetic labels" className="confusion-panel">
        {trained ? <div className="matrix-wrap"><div className="matrix-axis">PREDICTED</div><div className="matrix"><div></div><span>LOW</span><span>FLAGGED</span><span>ACTUAL LOW</span><strong>{matrix[0]?.[0] ?? 0}</strong><strong className="matrix-false">{matrix[0]?.[1] ?? 0}</strong><span>ACTUAL FLAGGED</span><strong className="matrix-missed">{matrix[1]?.[0] ?? 0}</strong><strong className="matrix-true">{matrix[1]?.[1] ?? 0}</strong></div><p className="matrix-key">Rows = actual class · columns = predicted class</p></div> :
          <EmptyState icon={BrainCircuit} title="NOT TRAINED" detail={model.reason ?? "Install scikit-learn to train the classifier."} />}
      </Panel>
      <Panel title="Feature importance" subtitle="Random Forest impurity importance · not causal explanation">
        {model.features.length ? <div className="importance-list">{model.features.map((feature) => <div key={feature.feature} className="importance-row">
          <div><span>{WEIGHT_NAMES[feature.feature] ?? feature.feature.replaceAll("_", " ")}</span><small>{(feature.importance * 100).toFixed(1)}%</small></div>
          <div className="importance-track"><i style={{ width: `${feature.importance * 100}%` }} /></div></div>)}</div> :
          <EmptyState icon={BrainCircuit} title="Baseline mode" detail="Feature importance is only available when the ML model is trained." />}
      </Panel>
      <div className="model-disclaimer"><Shield size={16} /><div><strong>Interpret responsibly</strong><p>{model.note ?? model.label_note} {model.label_note}</p><small>Transaction-time inputs exclude synthetic target labels. This model is not calibrated or validated for real-world decisions.</small></div></div>
    </div>
  </div>;
}

function InvestigationPage({
  cases, transactions, onReload, onOpenTransaction, showNotice, initialTransaction,
}: {
  cases: Investigation[]; transactions: Transaction[]; onReload: () => Promise<void>;
  onOpenTransaction: (tx: Transaction) => void; showNotice: (message: string) => void; initialTransaction: string;
}) {
  const [activeId, setActiveId] = useState("");
  const [title, setTitle] = useState("");
  const [priority, setPriority] = useState<Risk>("Medium");
  const [createTx, setCreateTx] = useState(initialTransaction);
  const [note, setNote] = useState("");
  const [evidenceTx, setEvidenceTx] = useState(initialTransaction || transactions[0]?.id || "");
  const [evidenceDescription, setEvidenceDescription] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => { if (!activeId && cases.length) setActiveId(cases[0].id); }, [cases, activeId]);
  const activeCase = cases.find((item) => item.id === activeId) ?? null;
  const transactionMap = useMemo(() => new Map(transactions.map((tx) => [tx.id, tx])), [transactions]);
  async function create(event: FormEvent) {
    event.preventDefault(); setBusy(true);
    try {
      const created = await request<Investigation>("/api/investigations", {
        method: "POST", body: JSON.stringify({ title, priority, transaction_ids: createTx ? [createTx] : [] }),
      });
      await onReload(); setActiveId(created.id); setTitle(""); showNotice("Investigation created and persisted.");
    } catch (error) { showNotice(error instanceof Error ? error.message : "Could not create investigation."); }
    finally { setBusy(false); }
  }
  async function changeStatus(status: Investigation["status"]) {
    if (!activeCase) return;
    setBusy(true);
    try { await request(`/api/investigations/${activeCase.id}`, { method: "PATCH", body: JSON.stringify({ status }) }); await onReload(); }
    catch (error) { showNotice(error instanceof Error ? error.message : "Could not update investigation."); }
    finally { setBusy(false); }
  }
  async function addNote(event: FormEvent) {
    event.preventDefault(); if (!activeCase || !note.trim()) return;
    setBusy(true);
    try { await request(`/api/investigations/${activeCase.id}/notes`, { method: "POST", body: JSON.stringify({ text: note }) }); setNote(""); await onReload(); showNotice("Analyst note saved."); }
    catch (error) { showNotice(error instanceof Error ? error.message : "Could not save note."); }
    finally { setBusy(false); }
  }
  async function addEvidence(event: FormEvent) {
    event.preventDefault(); if (!activeCase || !evidenceTx) return;
    setBusy(true);
    try {
      await request(`/api/investigations/${activeCase.id}/evidence`, { method: "POST", body: JSON.stringify({ transaction_id: evidenceTx, description: evidenceDescription }) });
      setEvidenceDescription(""); await onReload(); showNotice("Transaction evidence linked.");
    } catch (error) { showNotice(error instanceof Error ? error.message : "Could not link evidence."); }
    finally { setBusy(false); }
  }
  return <div className="page-content">
    <div className="page-intro"><div><div className="eyebrow">INTELLIGENCE / CASE MANAGEMENT</div><h1>Investigations</h1><p>Create review cases, preserve evidence and maintain an analyst timeline.</p></div>
      <span className="data-tag"><LockKeyhole size={13} /> PERSISTED LOCALLY · SQLITE</span></div>
    <div className="investigation-layout">
      <div className="case-column"><Panel title="Create investigation" subtitle="Optional transaction link" className="create-case-panel">
        <form className="case-create-form" onSubmit={create}><label>Case title<input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Review linked transfers" minLength={3} maxLength={120} required /></label>
          <div className="form-row"><label>Priority<select value={priority} onChange={(e) => setPriority(e.target.value as Risk)}>{(["Low", "Medium", "High", "Critical"] as Risk[]).map((risk) => <option key={risk}>{risk}</option>)}</select></label>
            <label>Transaction<select value={createTx} onChange={(e) => setCreateTx(e.target.value)}><option value="">No transaction</option>{transactions.map((tx) => <option key={tx.id} value={tx.id}>{tx.id} · {tx.risk_category}</option>)}</select></label></div>
          <button className="button button-primary full-width" disabled={busy}><Plus size={15} />Create case</button></form></Panel>
        <Panel title="Case queue" subtitle={`${cases.length} saved investigations`} className="case-queue">
          {cases.length === 0 ? <EmptyState icon={BriefcaseBusiness} title="No investigations yet" detail="Create a case to begin an evidence trail." /> :
            <div className="case-list">{cases.map((item) => <button key={item.id} className={`case-list-item ${item.id === activeId ? "case-active" : ""}`} onClick={() => setActiveId(item.id)}>
              <div className="case-list-top"><strong>{item.title}</strong><span className={`case-status case-${item.status.toLowerCase().replace(" ", "-")}`}>{item.status}</span></div>
              <span className="case-list-meta"><RiskBadge risk={item.priority} />{item.transaction_ids.length} evidence · updated {fmtDate(item.updated_at, { month: "short", day: "numeric" })}</span>
            </button>)}</div>}
        </Panel></div>
      <div className="case-detail-column">{activeCase ? <>
        <Panel title={activeCase.title} subtitle={`${activeCase.id} · opened ${fmtDate(activeCase.created_at)}`} className="case-detail-panel"
          action={<select className="status-select" value={activeCase.status} disabled={busy} onChange={(e) => void changeStatus(e.target.value as Investigation["status"])}><option>Open</option><option>In Review</option><option>Escalated</option><option>Closed</option></select>}>
          <div className="case-priority-line"><span>Priority</span><RiskBadge risk={activeCase.priority} /><span className="case-spacer" /><span>{activeCase.transaction_ids.length} linked transaction{activeCase.transaction_ids.length === 1 ? "" : "s"}</span></div>
          <div className="evidence-list">{activeCase.evidence.map((item) => {
            const tx = transactionMap.get(item.transaction_id);
            return <div className="evidence-card" key={item.transaction_id}><span className="evidence-icon"><Fingerprint size={15} /></span>
              <div><button className="text-button mono" onClick={() => tx && onOpenTransaction(tx)}>{item.transaction_id}<ArrowUpRight size={13} /></button><small>{item.description || "Linked transaction record"} · {fmtDate(item.at)}</small>
                {tx && <span className="evidence-meta">{fmtMoney(tx.amount)} · <RiskBadge risk={tx.risk_category} /></span>}</div></div>;
          })}{activeCase.evidence.length === 0 && <p className="muted-copy">No transaction evidence linked yet.</p>}</div>
          <form className="inline-form evidence-form" onSubmit={addEvidence}><label>Link transaction<select value={evidenceTx} onChange={(e) => setEvidenceTx(e.target.value)}>{transactions.map((tx) => <option key={tx.id} value={tx.id}>{tx.id} · {tx.sender} → {tx.recipient}</option>)}</select></label>
            <label>Description<input value={evidenceDescription} onChange={(e) => setEvidenceDescription(e.target.value)} placeholder="Context for this evidence (optional)" maxLength={500} /></label>
            <button className="button button-secondary" disabled={busy || !evidenceTx}><Plus size={14} />Link evidence</button></form>
        </Panel>
        <div className="case-bottom-grid"><Panel title="Analyst notes" subtitle="Timestamped case observations">
          <div className="notes-list">{activeCase.notes.map((item, i) => <div className="note-item" key={`${item.at}-${i}`}><span className="note-dot" /><div><p>{item.text}</p><small>{item.author} · {fmtDate(item.at)}</small></div></div>)}{activeCase.notes.length === 0 && <p className="muted-copy">No notes added.</p>}</div>
          <form className="note-form" onSubmit={addNote}><textarea value={note} onChange={(e) => setNote(e.target.value)} placeholder="Add an analyst observation..." maxLength={2000} required /><button className="button button-primary" disabled={busy || !note.trim()}><Plus size={14} />Save note</button></form>
        </Panel>
        <Panel title="Case timeline" subtitle="Audit trail">
          <div className="timeline">{[...activeCase.timeline].reverse().map((item, i) => <div className="timeline-item" key={`${item.at}-${i}`}><span className="timeline-line" /><span className="timeline-dot" /><div><strong>{item.event}</strong><small>{fmtDate(item.at)}</small></div></div>)}</div>
        </Panel></div>
      </> : <Panel title="Investigation details"><EmptyState icon={BriefcaseBusiness} title="Select a case" detail="Create an investigation or choose one from the queue." /></Panel>}</div>
    </div>
  </div>;
}

function ReportsPage({ transactions, showNotice }: { transactions: Transaction[]; showNotice: (message: string) => void }) {
  const [risk, setRisk] = useState("All risk");
  const [channel, setChannel] = useState("All channels");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const filtered = useMemo(() => transactions.filter((tx) => {
    const day = tx.timestamp.slice(0, 10);
    return (risk === "All risk" || tx.risk_category === risk) &&
      (channel === "All channels" || tx.channel === channel) &&
      (!dateFrom || day >= dateFrom) && (!dateTo || day <= dateTo);
  }), [transactions, risk, channel, dateFrom, dateTo]);
  function exportCsv() {
    if (!filtered.length) { showNotice("No records match the selected report filters."); return; }
    const columns = ["id", "timestamp", "sender", "recipient", "amount", "currency", "channel", "region", "status", "risk_score", "risk_category", "signals", "explanation"];
    const escape = (value: unknown) => `"${String(value ?? "").replaceAll('"', '""')}"`;
    const rows = filtered.map((tx) => columns.map((key) => {
      if (key === "signals") return escape(tx.signals.map((signal) => signal.label).join("; "));
      return escape(tx[key as keyof Transaction]);
    }).join(","));
    const csv = [columns.join(","), ...rows].join("\r\n");
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = "fraudshield-demo-transactions.csv";
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    showNotice(`Exported ${filtered.length.toLocaleString()} actual demo records.`);
  }
  return <div className="page-content">
    <div className="page-intro"><div><div className="eyebrow">MANAGE / DATA EXPORT</div><h1>Reports</h1><p>Export transaction records with their current model scores and explanatory signals.</p></div>
      <span className="data-tag"><FileBarChart2 size={13} /> CSV EXPORT</span></div>
    <div className="report-summary-grid"><MetricCard icon={FileBarChart2} label="Matching records" value={filtered.length.toLocaleString()} detail="Filtered records ready to export" color="blue" />
      <MetricCard icon={ShieldAlert} label="Elevated risk" value={filtered.filter((tx) => tx.risk_score >= 56).length.toLocaleString()} detail="In current report selection" color="orange" />
      <MetricCard icon={WalletCards} label="Selected volume" value={fmtMoney(filtered.reduce((sum, tx) => sum + tx.amount, 0))} detail="Synthetic demo activity only" color="cyan" /></div>
    <Panel title="Transaction report" subtitle="Filters apply to actual records in the shared demo dataset" className="report-panel">
      <div className="report-filters"><label>Risk category<select value={risk} onChange={(e) => setRisk(e.target.value)}><option>All risk</option>{(["Low", "Medium", "High", "Critical"] as Risk[]).map((item) => <option key={item}>{item}</option>)}</select></label>
        <label>Channel<select value={channel} onChange={(e) => setChannel(e.target.value)}><option>All channels</option>{["card", "bank_transfer", "wallet", "wire"].map((item) => <option key={item} value={item}>{item.replace("_", " ")}</option>)}</select></label>
        <label>From date<input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} /></label>
        <label>To date<input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} /></label>
        <button className="button button-primary export-button" onClick={exportCsv} disabled={!filtered.length}><Download size={15} />Export CSV</button></div>
      <div className="report-preview-head"><span>REPORT PREVIEW</span><span>Showing first 8 of {filtered.length.toLocaleString()}</span></div>
      <div className="table-scroll"><table className="data-table"><thead><tr><th>ID</th><th>TIMESTAMP</th><th>ACCOUNT FLOW</th><th>AMOUNT</th><th>RISK</th><th>SCORE</th></tr></thead>
        <tbody>{filtered.slice(0, 8).map((tx) => <tr key={tx.id}><td className="mono">{tx.id}</td><td>{fmtDate(tx.timestamp)}</td><td className="mono">{tx.sender} → {tx.recipient}</td><td>{fmtMoney(tx.amount)}</td><td><RiskBadge risk={tx.risk_category} /></td><td>{tx.risk_score}</td></tr>)}</tbody></table>
      </div>
    </Panel>
    <div className="report-note"><CircleHelp size={15} /><span>CSV includes transaction IDs, timestamps, fictional account IDs, risk score, category, signals and the model-generated explanation. No personally identifying data is present.</span></div>
  </div>;
}

function SettingsPage({
  settings, saveSettings, resetDemo, showNotice,
}: {
  settings: AppSettings; saveSettings: (value: AppSettings) => Promise<void>; resetDemo: () => Promise<void>;
  showNotice: (message: string) => void;
}) {
  const [draft, setDraft] = useState<AppSettings>(settings);
  const [busy, setBusy] = useState(false);
  const [dirty, setDirty] = useState(false);
  useEffect(() => { setDraft(settings); setDirty(false); }, [settings]);
  function updateThreshold(key: keyof AppSettings["thresholds"], value: number) {
    setDraft((state) => ({ ...state, thresholds: { ...state.thresholds, [key]: value } })); setDirty(true);
  }
  function updateWeight(key: string, value: number) {
    setDraft((state) => ({ ...state, weights: { ...state.weights, [key]: value } })); setDirty(true);
  }
  async function save(event: FormEvent) {
    event.preventDefault(); setBusy(true);
    try { await saveSettings(draft); setDirty(false); showNotice("Risk thresholds and scoring weights saved."); }
    catch (error) { showNotice(error instanceof Error ? error.message : "Settings could not be saved."); }
    finally { setBusy(false); }
  }
  async function reset() {
    if (!window.confirm("Reset investigations and scoring settings to the deterministic demo defaults?")) return;
    setBusy(true);
    try { await resetDemo(); setDirty(false); showNotice("Demo cases cleared and scoring settings reset."); }
    catch (error) { showNotice(error instanceof Error ? error.message : "Demo reset failed."); }
    finally { setBusy(false); }
  }
  const orderedThresholds = [draft.thresholds.low_max, draft.thresholds.medium_max, draft.thresholds.high_max];
  const validThresholds = orderedThresholds[0] >= 0 && orderedThresholds[0] < orderedThresholds[1] &&
    orderedThresholds[1] < orderedThresholds[2] && orderedThresholds[2] <= 100;
  return <div className="page-content">
    <div className="page-intro"><div><div className="eyebrow">MANAGE / CONFIGURATION</div><h1>Settings</h1><p>Adjust demo risk categorization and supported scoring signal weights.</p></div>
      <span className="data-tag"><Settings2 size={13} /> APPLICATION SETTINGS</span></div>
    <form onSubmit={save}>
      <Panel title="Risk thresholds" subtitle="Score category boundaries · applied to transaction analysis immediately">
        <div className="threshold-display"><span className="threshold low" style={{ width: `${draft.thresholds.low_max}%` }}>LOW</span><span className="threshold medium" style={{ width: `${Math.max(0, draft.thresholds.medium_max - draft.thresholds.low_max)}%` }}>MEDIUM</span><span className="threshold high" style={{ width: `${Math.max(0, draft.thresholds.high_max - draft.thresholds.medium_max)}%` }}>HIGH</span><span className="threshold critical" style={{ width: `${Math.max(0, 100 - draft.thresholds.high_max)}%` }}>CRITICAL</span></div>
        <div className="threshold-fields">{([
          ["low_max", "Low risk up to"], ["medium_max", "Medium risk up to"], ["high_max", "High risk up to"],
        ] as [keyof AppSettings["thresholds"], string][]).map(([key, label]) => <label key={key}>{label}<div className="number-input"><input type="number" min={0} max={100} value={draft.thresholds[key]} onChange={(e) => updateThreshold(key, Number(e.target.value))} /><span>/ 100</span></div></label>)}</div>
        {!validThresholds && <p className="validation-error">Thresholds must increase in order and stay between 0 and 100.</p>}
      </Panel>
      <Panel title="Scoring signal weights" subtitle="Weights are normalized on use; zero disables a signal's contribution" className="weights-panel">
        <div className="weight-list">{Object.entries(draft.weights).map(([key, value]) => <label className="weight-row" key={key}><span>{WEIGHT_NAMES[key] ?? key}</span>
          <input type="range" min={0} max={1} step={0.01} value={value} onChange={(e) => updateWeight(key, Number(e.target.value))} />
          <input className="weight-number" type="number" min={0} max={1} step={0.01} value={value} onChange={(e) => updateWeight(key, Number(e.target.value))} /></label>)}</div>
        <div className="settings-footer"><p>These settings affect risk scores in tables, analytics and the network graph. The model evaluation reports the classifier metrics separately from these demo score adjustments.</p>
          <button className="button button-primary" type="submit" disabled={!dirty || !validThresholds || busy}><Check size={15} />Save settings</button></div>
      </Panel>
    </form>
    <Panel title="Demo data management" subtitle="Synthetic transaction data regenerates deterministically from the same seed">
      <div className="reset-row"><div><strong>Reset demo workspace</strong><span>Clears saved investigations and restores default scoring settings. Transactions and model remain unchanged.</span></div>
        <button className="button button-danger" type="button" onClick={() => void reset()} disabled={busy}><RefreshCw size={14} />Reset demo</button></div>
    </Panel>
    <div className="report-note"><Shield size={15} /><span>Live data integrations are NOT_CONFIGURED. No external financial services or customer identities are connected.</span></div>
  </div>;
}

export default function App() {
  const [page, setPage] = useState<Page>("Overview");
  const [overview, setOverview] = useState<Overview | null>(null);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [model, setModel] = useState<ModelInsights | null>(null);
  const [cases, setCases] = useState<Investigation[]>([]);
  const [settings, setSettings] = useState<AppSettings | null>(null);
  const [network, setNetwork] = useState<NetworkData | null>(null);
  const [selectedTx, setSelectedTx] = useState<Transaction | null>(null);
  const [pageSearch, setPageSearch] = useState("");
  const [globalSearch, setGlobalSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [notificationOpen, setNotificationOpen] = useState(false);
  const noticeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const showNotice = useCallback((message: string) => {
    setNotice(message);
    if (noticeTimer.current) clearTimeout(noticeTimer.current);
    noticeTimer.current = setTimeout(() => setNotice(""), 4400);
  }, []);
  useEffect(() => () => { if (noticeTimer.current) clearTimeout(noticeTimer.current); }, []);

  const loadCore = useCallback(async () => {
    const [overviewResult, transactionResult, modelResult, casesResult, settingsResult] = await Promise.all([
      request<Overview>("/api/overview"),
      request<{ items: Transaction[]; total: number }>("/api/transactions"),
      request<ModelInsights>("/api/model"),
      request<Investigation[]>("/api/investigations"),
      request<AppSettings>("/api/settings"),
    ]);
    setOverview(overviewResult);
    setTransactions(transactionResult.items);
    setModel(modelResult);
    setCases(casesResult);
    setSettings(settingsResult);
    setError("");
  }, []);

  useEffect(() => {
    let active = true;
    void loadCore().catch((reason: unknown) => {
      if (active) setError(reason instanceof Error ? reason.message : "Application data could not be loaded.");
    }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [loadCore]);

  const loadNetwork = useCallback(async (transactionId?: string) => {
    setNetwork(null);
    const query = transactionId ? `?transaction_id=${encodeURIComponent(transactionId)}` : "";
    try { setNetwork(await request<NetworkData>(`/api/network${query}`)); }
    catch (reason) { showNotice(reason instanceof Error ? reason.message : "Network data could not be loaded."); }
  }, [showNotice]);

  function openTransaction(transaction: Transaction) {
    setSelectedTx(transaction); setPageSearch(transaction.id); setPage("Live Transactions");
  }
  async function analyzeTransaction(transaction: Transaction) {
    try {
      const result = await request<Transaction>(`/api/transactions/${transaction.id}/analyze`, { method: "POST" });
      setSelectedTx(result); showNotice(`Analysis complete · ${result.risk_category} risk · score ${result.risk_score}.`);
    } catch (reason) { showNotice(reason instanceof Error ? reason.message : "Analysis failed."); }
  }
  async function saveSettings(value: AppSettings) {
    const saved = await request<AppSettings>("/api/settings", { method: "PUT", body: JSON.stringify(value) });
    await loadCore(); setSettings(saved);
  }
  async function resetDemo() {
    await request("/api/reset", { method: "POST" }); setSelectedTx(null); setNetwork(null); await loadCore();
  }
  async function createCaseFor(transaction: Transaction) {
    try {
      const created = await request<Investigation>("/api/investigations", {
        method: "POST", body: JSON.stringify({ title: `Review ${transaction.id}`, priority: transaction.risk_category, transaction_ids: [transaction.id] }),
      });
      await loadCore(); setSelectedTx(transaction); setPage("Investigations"); showNotice(`Investigation ${created.id} created with ${transaction.id} linked.`);
    } catch (reason) { showNotice(reason instanceof Error ? reason.message : "Could not create investigation."); }
  }
  function openNetwork(transaction: Transaction) {
    setSelectedTx(transaction); setPage("Fraud Network");
  }

  const title = page;
  const allAlerts = overview?.recent_alerts ?? [];
  const navGroups = [...new Set(NAV.map((item) => item.group))];
  if (loading) return <div className="app-loading"><div className="brand-mark large"><Shield size={25} /></div><LoaderCircle className="spin" size={22} /><span>Loading deterministic demo data…</span></div>;
  if (error || !overview || !model || !settings) return <div className="app-error"><div className="brand-mark large"><Shield size={25} /></div><h1>FraudShield API unavailable</h1><p>{error || "Application data was incomplete."}</p><div><code>python -m uvicorn backend.app:app --reload --port 8001</code></div><button className="button button-primary" onClick={() => { setError(""); setLoading(true); void loadCore().catch((reason: unknown) => setError(reason instanceof Error ? reason.message : "Could not reload application data.")).finally(() => setLoading(false)); }}>Retry connection</button></div>;

  return <div className="app-shell">
    {sidebarOpen && <button className="mobile-scrim" onClick={() => setSidebarOpen(false)} aria-label="Close navigation" />}
    <aside className={`sidebar ${sidebarOpen ? "sidebar-open" : ""}`}>
      <div className="brand"><span className="brand-mark"><Shield size={19} /></span><span className="brand-name">fraud<span>shield</span><small>RISK OPERATIONS</small></span><button className="sidebar-close icon-button" onClick={() => setSidebarOpen(false)}><X size={17} /></button></div>
      <div className="workspace-select"><div className="workspace-icon"><LockKeyhole size={15} /></div><div><strong>Demo workspace</strong><small>Risk operations</small></div><ChevronDown size={15} /></div>
      <nav className="sidebar-nav">{navGroups.map((group) => <div className="nav-group" key={group}><div className="nav-label">{group}</div>{NAV.filter((item) => item.group === group).map(({ label, icon: Icon }) => <button key={label} className={`nav-item ${page === label ? "nav-active" : ""}`} onClick={() => { setPage(label); setSidebarOpen(false); }}>
        <Icon size={17} strokeWidth={1.8} /><span>{label}</span>{label === "Investigations" && cases.length > 0 && <span className="nav-count">{cases.length}</span>}
      </button>)}</div>)}</nav>
      <div className="sidebar-bottom"><div className="data-integrity"><div><span className="pulse-dot" />DEMO MODE</div><p>Deterministic synthetic data<br />Live integrations: NOT_CONFIGURED</p></div>
        <button className="profile-button"><span className="avatar">A</span><span><strong>Risk Analyst</strong><small>Demo workspace</small></span><MoreHorizontal size={16} /></button></div>
    </aside>
    <main className="main-shell">
      <header className="topbar"><div className="topbar-left"><button className="mobile-menu icon-button" onClick={() => setSidebarOpen(true)} aria-label="Open navigation"><Menu size={19} /></button>
        <span className="breadcrumb">FraudShield <ChevronRight size={13} /> <strong>{title}</strong></span></div>
        <div className="topbar-right"><label className="global-search"><Search size={15} /><input value={globalSearch} onChange={(e) => setGlobalSearch(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") { setPageSearch(globalSearch); setPage("Live Transactions"); } }} placeholder="Search transactions..." /><kbd>↵</kbd></label>
          <span className="topbar-status"><i />DEMO</span><div className="notification-wrap"><button className="icon-button notification-button" onClick={() => setNotificationOpen((value) => !value)} aria-label="Risk notifications"><Bell size={17} />{allAlerts.length > 0 && <i />}</button>
            {notificationOpen && <div className="notification-popover"><strong>Recent high-risk signals</strong>{allAlerts.slice(0, 3).map((tx) => <button key={tx.id} onClick={() => { openTransaction(tx); setNotificationOpen(false); }}><AlertTriangle size={14} />{tx.id}<RiskBadge risk={tx.risk_category} /></button>)}{!allAlerts.length && <p>No high-risk signals.</p>}</div>}</div>
          <button className="avatar top-avatar">A</button></div></header>
      {page === "Overview" && <OverviewPage data={overview} openTransaction={openTransaction} goTo={setPage} />}
      {page === "Live Transactions" && <TransactionPage transactions={transactions} search={pageSearch} setSearch={setPageSearch} selectedTransaction={selectedTx} onSelectTransaction={setSelectedTx} onAnalyze={analyzeTransaction} openNetwork={openNetwork} createCase={createCaseFor} />}
      {page === "Fraud Network" && <NetworkPage data={network} load={loadNetwork} selectedTransaction={selectedTx} onSelectTransaction={setSelectedTx} transactions={transactions} />}
      {page === "AI Model Insights" && <ModelPage model={model} />}
      {page === "Investigations" && <InvestigationPage cases={cases} transactions={transactions} onReload={loadCore} onOpenTransaction={openTransaction} showNotice={showNotice} initialTransaction={selectedTx?.id ?? ""} />}
      {page === "Reports" && <ReportsPage transactions={transactions} showNotice={showNotice} />}
      {page === "Settings" && <SettingsPage settings={settings} saveSettings={saveSettings} resetDemo={resetDemo} showNotice={showNotice} />}
      <footer className="app-footer"><span><Shield size={13} />FraudShield AI <b>·</b> DEMO MODE</span><span>For demonstration only · not financial advice or a fraud determination</span></footer>
    </main>
    {notice && <div className="toast"><Check size={16} /><span>{notice}</span><button onClick={() => setNotice("")}><X size={14} /></button></div>}
  </div>;
}
