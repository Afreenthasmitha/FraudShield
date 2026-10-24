# FraudShield AI

FraudShield AI is a local fraud-operations demo using one reproducible synthetic transaction dataset. It runs a React/TypeScript dashboard and FastAPI service. **DEMO MODE** records, account IDs, region tags, and labels are fictional. A risk score is a model estimate, not confirmed fraud; synthetic test metrics do not establish real-world performance. Live financial/compliance integrations are `NOT_CONFIGURED`.

## Requirements

- Windows 10/11 with PowerShell
- Python 3.11 (recommended; use the same supported interpreter for the virtual environment and all backend commands)
- Node.js 20 or newer with npm

## Install and run (PowerShell)

Open two PowerShell terminals in the project folder (`D:\FraudShield`).

### Terminal 1: API

Create the Python 3.11 environment once, then install dependencies and start FastAPI:

```powershell
Set-Location D:\FraudShield
py -3.11 -m venv .venv311
& .\.venv311\Scripts\python.exe -m pip install --upgrade pip
& .\.venv311\Scripts\python.exe -m pip install -r requirements.txt
$env:FRAUDSHIELD_ALLOWED_ORIGINS = "http://localhost:5174,http://127.0.0.1:5174"
& .\.venv311\Scripts\python.exe -m uvicorn backend.app:app --host 127.0.0.1 --port 8001
```

Leave this terminal running. Confirm the API from another terminal:

```powershell
Invoke-RestMethod http://127.0.0.1:8001/api/health
```

The default SQLite database and persisted model are created under `backend\` on first start.

### Terminal 2: dashboard

```powershell
Set-Location D:\FraudShield
npm install
$env:FRAUDSHIELD_API_TARGET = "http://127.0.0.1:8001"
npm run dev
```

Open **http://localhost:5174**. Vite uses a same-origin `/api` proxy to the API on port 8001, so development does not depend on a frontend hardcoded API URL or cross-origin browser preflight. The frontend port is strict: if 5174 is occupied, Vite reports the conflict rather than silently opening a different port.

### Existing port conflicts

Check listeners before choosing another port; do not stop processes you do not own:

```powershell
Get-NetTCPConnection -State Listen |
  Where-Object { $_.LocalPort -in 5174,8001 } |
  Select-Object LocalAddress,LocalPort,OwningProcess
```

If another service owns 8001, select a free API port and set the same port in both terminals:

```powershell
# API terminal example
& .\.venv311\Scripts\python.exe -m uvicorn backend.app:app --host 127.0.0.1 --port 8011

# Dashboard terminal example
$env:FRAUDSHIELD_API_TARGET = "http://127.0.0.1:8011"
npm run dev
```

The Vite proxy forwards `/api` to `FRAUDSHIELD_API_TARGET`; direct browser access is not needed in development. For a separately hosted frontend, set `VITE_API_BASE_URL` at build time to the API origin and configure `FRAUDSHIELD_ALLOWED_ORIGINS` with the exact frontend origin.

## Configuration

- `FRAUDSHIELD_DB`: SQLite file path (default `backend\fraudshield.db`).
- `FRAUDSHIELD_MODEL_PATH`: serialized scikit-learn pipeline path (default `backend\fraudshield-model.joblib`).
- `FRAUDSHIELD_ALLOWED_ORIGINS`: comma-separated exact origins for direct cross-origin deployments.
- `FRAUDSHIELD_API_TARGET`: Vite development proxy target (default `http://127.0.0.1:8001`).
- `VITE_API_BASE_URL`: optional frontend API origin for non-proxied builds; omit it for the same-origin `/api` default.

Set variables in the relevant PowerShell terminal before starting its process. Do not commit secrets or local environment files.

## Application features

- Overview dashboard with metrics, trends, risk distribution, fictional-region heat tiles, channel activity, recent alerts, and customer-risk watchlist derived from the shared synthetic dataset.
- Live transaction search, filters, pagination, model analysis, contributing signals, explanations, connected-account navigation, and case creation.
- Directed synthetic account-transfer graph with click-to-focus, suspicious path highlighting, pan, and zoom.
- Model status, held-out metrics, confusion matrix, feature importances, and explicit test positive count.
- SQLite-persisted investigations, transaction evidence, analyst notes, statuses, and timeline.
- Filtered CSV export containing actual records from the shared demo dataset.
- Persisted risk thresholds and supported scoring weights. Reset clears investigations and restores default settings; deterministic transactions remain unchanged.

## Model and data

The app generates 1,500 deterministic fictional transactions. “First-seen recipient” means the sender has not previously transacted with that recipient in the generated timeline. Model inputs are transaction-time features; the generated target label is not an input. The first 75% of the chronological data is used for training and training-only time-series calibration; the final 25% is a future holdout and is evaluated only after fitting. The training pipeline imputes missing values, uses a class-weighted Random Forest, and applies sigmoid probability calibration using training-period folds. The pipeline is persisted and reused when the dataset/model signature matches. If scikit-learn is unavailable or training fails, the API reports `NOT TRAINED` and uses its transparent baseline; it does not claim trained metrics.

The held-out positive count is shown alongside precision and recall because rare synthetic labels can make these metrics unstable. Neither the dataset nor its metrics are validated for real financial activity, and the application is not a production fraud decision system.

## Tests and checks (PowerShell)

```powershell
Set-Location D:\FraudShield
& .\.venv311\Scripts\python.exe -m pytest -q
npm run typecheck
npm run build
```

## Troubleshooting

- **Dashboard says “FraudShield API unavailable”:** keep the API terminal running; check `http://127.0.0.1:8001/api/health`; verify `FRAUDSHIELD_API_TARGET` is set before starting Vite; restart `npm run dev` after changing Vite environment variables.
- **Port 5174 is occupied:** inspect the owning PID with `Get-NetTCPConnection` and choose whether to stop your own process or run the dashboard after changing `vite.config.ts`. Vite intentionally will not pick a different port silently.
- **API port is occupied:** use another free backend port and set the matching `FRAUDSHIELD_API_TARGET` before starting Vite.
- **Python dependency/install error:** use the project interpreter explicitly: `& .\.venv311\Scripts\python.exe -m pip install -r requirements.txt`. Check it with `& .\.venv311\Scripts\python.exe --version` and `& .\.venv311\Scripts\python.exe -m pip check`.
- **Existing `.venv` reports Python 3.14 or native-package import errors:** do not reuse that environment. Create a separate Python 3.11 environment with `py -3.11 -m venv .venv311`, install the requirements there, and use `.venv311\Scripts\python.exe` for every backend command. Keep the existing environment untouched until you no longer need it.
- **Model says `NOT TRAINED`:** inspect FastAPI terminal logs. SQLite/case endpoints remain usable with the disclosed baseline. A corrupt or mismatched model artifact is logged and retrained; a write failure is exposed in model persistence status.
