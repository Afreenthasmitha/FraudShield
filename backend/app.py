from __future__ import annotations

import json
import hashlib
import logging
import math
import os
import random
import sqlite3
import tempfile
from contextlib import asynccontextmanager
from collections import Counter, defaultdict, deque
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any, AsyncIterator, Literal
from uuid import uuid4

from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

logger = logging.getLogger(__name__)

try:
    import joblib
    from sklearn.calibration import CalibratedClassifierCV
    from sklearn.ensemble import RandomForestClassifier
    from sklearn.impute import SimpleImputer
    from sklearn.metrics import (
        accuracy_score,
        confusion_matrix,
        f1_score,
        precision_score,
        recall_score,
        roc_auc_score,
    )
    from sklearn.model_selection import TimeSeriesSplit
    from sklearn.pipeline import Pipeline
except ImportError:
    RandomForestClassifier = None


SEED = 271828
TRANSACTION_COUNT = 1500
FEATURES = [
    "log_amount",
    "velocity_1h",
    "new_recipient",
    "rapid_transfer",
    "night_transaction",
    "international",
    "channel_risk",
]
CHANNELS = ["card", "bank_transfer", "wallet", "wire"]
REGIONS = ["North America", "Europe", "Asia Pacific", "Latin America"]
CHANNEL_RISK = {"card": 0.12, "bank_transfer": 0.22, "wallet": 0.38, "wire": 0.68}
DATABASE_PATH = Path(os.getenv("FRAUDSHIELD_DB", Path(__file__).with_name("fraudshield.db")))
MODEL_PATH = Path(
    os.getenv("FRAUDSHIELD_MODEL_PATH", Path(__file__).with_name("fraudshield-model.joblib"))
)
MODEL_CONFIG = {
    "algorithm": "random_forest",
    "estimators": 120,
    "max_depth": 8,
    "min_samples_leaf": 3,
    "class_weight": "balanced_subsample",
    "calibration": "sigmoid_time_series_cv_3",
}
DEFAULT_SETTINGS: dict[str, Any] = {
    "thresholds": {"low_max": 30, "medium_max": 55, "high_max": 80},
    "weights": {
        "amount": 0.25,
        "velocity": 0.2,
        "new_recipient": 0.25,
        "rapid_transfer": 0.15,
        "night_transaction": 0.1,
        "international": 0.05,
    },
}

@asynccontextmanager
async def lifespan(_: FastAPI) -> AsyncIterator[None]:
    initialize_db()
    train_model()
    yield


app = FastAPI(title="FraudShield AI", version="1.0.0", lifespan=lifespan)
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        origin.strip()
        for origin in os.getenv(
            "FRAUDSHIELD_ALLOWED_ORIGINS",
            "http://localhost:5174,http://127.0.0.1:5174,http://localhost:5173,http://127.0.0.1:5173",
        ).split(",")
    ],
    allow_methods=["*"],
    allow_headers=["*"],
)


def connect_db() -> sqlite3.Connection:
    connection = sqlite3.connect(DATABASE_PATH)
    connection.row_factory = sqlite3.Row
    return connection


def initialize_db() -> None:
    DATABASE_PATH.parent.mkdir(parents=True, exist_ok=True)
    with connect_db() as db:
        db.executescript(
            """
            CREATE TABLE IF NOT EXISTS investigations (
                id TEXT PRIMARY KEY,
                title TEXT NOT NULL,
                status TEXT NOT NULL,
                priority TEXT NOT NULL,
                transaction_ids TEXT NOT NULL,
                notes TEXT NOT NULL,
                evidence TEXT NOT NULL,
                timeline TEXT NOT NULL,
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL
            );
            CREATE TABLE IF NOT EXISTS app_settings (
                id INTEGER PRIMARY KEY CHECK (id = 1),
                value TEXT NOT NULL
            );
            """
        )
        if db.execute("SELECT 1 FROM app_settings WHERE id = 1").fetchone() is None:
            db.execute(
                "INSERT INTO app_settings(id, value) VALUES(1, ?)",
                (json.dumps(DEFAULT_SETTINGS),),
            )


def make_dataset() -> list[dict[str, Any]]:
    rng = random.Random(SEED)
    start = datetime(2026, 8, 1, tzinfo=timezone.utc)
    accounts = [f"acct_{i:04d}" for i in range(1, 161)]
    active_senders = accounts[:60]
    seen_recipients_by_sender: dict[str, set[str]] = defaultdict(set)
    recent_by_sender: dict[str, deque[datetime]] = defaultdict(deque)
    recent_senders: list[str] = []
    records: list[dict[str, Any]] = []
    timestamp = start

    for index in range(TRANSACTION_COUNT):
        if index:
            timestamp += timedelta(minutes=rng.randint(2, 8))
        sender = (
            rng.choice(recent_senders[-12:])
            if recent_senders and rng.random() < 0.28
            else rng.choice(active_senders)
        )
        recent_senders.append(sender)
        recipient = rng.choice(accounts)
        while recipient == sender:
            recipient = rng.choice(accounts)
        transaction_time = timestamp + timedelta(seconds=rng.randint(0, 59))
        recent = recent_by_sender[sender]
        while recent and (timestamp - recent[0]).total_seconds() > 3600:
            recent.popleft()
        velocity = len(recent)
        recent.append(transaction_time)
        amount = round(min(rng.lognormvariate(5.05, 1.0), 12500), 2)
        channel = rng.choices(CHANNELS, weights=[0.42, 0.31, 0.17, 0.10], k=1)[0]
        new_recipient = int(recipient not in seen_recipients_by_sender[sender])
        seen_recipients_by_sender[sender].add(recipient)
        rapid = int(velocity >= 3)
        night = int(transaction_time.hour < 5 or transaction_time.hour >= 23)
        international = int(rng.random() < 0.13)
        amount_risk = min(max((amount - 250) / 1750, 0.0), 1.0)
        label = int(
            (amount > 900 and new_recipient)
            or amount > 3800
            or (velocity >= 4 and new_recipient)
            or (night and international and amount > 550)
            or (velocity >= 6 and amount > 450)
        )
        records.append(
            {
                "id": f"txn_{index + 1:05d}",
                "timestamp": transaction_time.isoformat(),
                "sender": sender,
                "recipient": recipient,
                "amount": amount,
                "currency": "USD",
                "channel": channel,
                "region": rng.choices(REGIONS, weights=[0.42, 0.26, 0.24, 0.08], k=1)[0],
                "status": rng.choices(["completed", "pending", "review"], [0.87, 0.08, 0.05])[0],
                "features": {
                    "log_amount": math.log1p(amount),
                    "velocity_1h": velocity,
                    "new_recipient": new_recipient,
                    "rapid_transfer": rapid,
                    "night_transaction": night,
                    "international": international,
                    "channel_risk": CHANNEL_RISK[channel],
                    "amount_risk": amount_risk,
                },
                "synthetic_label": label,
            }
        )
    return records


TRANSACTIONS = make_dataset()
MODEL: Any = None
MODEL_PROBABILITIES: dict[str, float] = {}
MODEL_PERSISTENCE_STATUS = "NOT_STARTED"
MODEL_METRICS: dict[str, Any] = {
    "status": "NOT TRAINED",
    "reason": "The model has not been initialized; using the transparent baseline.",
}
FEATURE_IMPORTANCES: list[dict[str, Any]] = []


def feature_vector(transaction: dict[str, Any]) -> list[float]:
    return [float(transaction["features"][feature]) for feature in FEATURES]


def dataset_signature() -> str:
    data = [
        (feature_vector(transaction), transaction["synthetic_label"])
        for transaction in TRANSACTIONS
    ]
    serialized = json.dumps(
        {"config": MODEL_CONFIG, "features": FEATURES, "data": data},
        separators=(",", ":"),
        sort_keys=True,
    )
    return hashlib.sha256(serialized.encode("utf-8")).hexdigest()


def positive_probability(model: Any, rows: list[list[float]]) -> list[float]:
    classes = list(model.classes_)
    if 1 not in classes:
        raise ValueError("The trained model does not include the positive class.")
    probabilities = model.predict_proba(rows)[:, classes.index(1)]
    if not all(math.isfinite(float(probability)) and 0 <= probability <= 1 for probability in probabilities):
        raise ValueError("The model returned an invalid positive-class probability.")
    return [float(probability) for probability in probabilities]


def load_persisted_model(signature: str) -> Any | None:
    if RandomForestClassifier is None or not MODEL_PATH.is_file():
        return None
    try:
        artifact = joblib.load(MODEL_PATH)
        model = artifact["model"]
        if artifact.get("signature") != signature or not callable(getattr(model, "predict_proba", None)):
            logger.info("Ignoring persisted model because its data signature or estimator is invalid.")
            return None
        if 1 not in list(model.classes_):
            logger.warning("Ignoring persisted model because it has no positive class.")
            return None
        return model
    except Exception:
        logger.exception("Could not load persisted FraudShield model from %s; retraining.", MODEL_PATH)
        return None


def persist_model(model: Any, signature: str) -> None:
    MODEL_PATH.parent.mkdir(parents=True, exist_ok=True)
    temporary_path: str | None = None
    try:
        with tempfile.NamedTemporaryFile(
            prefix=f"{MODEL_PATH.stem}-",
            suffix=".tmp",
            dir=MODEL_PATH.parent,
            delete=False,
        ) as temporary:
            temporary_path = temporary.name
        joblib.dump({"signature": signature, "model": model}, temporary_path)
        os.replace(temporary_path, MODEL_PATH)
    finally:
        if temporary_path and os.path.exists(temporary_path):
            os.unlink(temporary_path)


def train_model() -> None:
    global MODEL, MODEL_METRICS, FEATURE_IMPORTANCES, MODEL_PROBABILITIES
    global MODEL_PERSISTENCE_STATUS
    if RandomForestClassifier is None:
        MODEL_PERSISTENCE_STATUS = "UNAVAILABLE"
        MODEL_METRICS = {
            "status": "NOT TRAINED",
            "reason": "scikit-learn/joblib is unavailable; using the transparent baseline.",
        }
        return
    try:
        x = [feature_vector(tx) for tx in TRANSACTIONS]
        y = [tx["synthetic_label"] for tx in TRANSACTIONS]
        split_index = int(len(x) * 0.75)
        x_train, x_test = x[:split_index], x[split_index:]
        y_train, y_test = y[:split_index], y[split_index:]
        signature = dataset_signature()
        candidate = load_persisted_model(signature)
        if candidate is not None:
            MODEL_PERSISTENCE_STATUS = "LOADED"
        else:
            base_pipeline = Pipeline(
                [
                    ("imputer", SimpleImputer(strategy="median")),
                    (
                        "classifier",
                        RandomForestClassifier(
                            n_estimators=MODEL_CONFIG["estimators"],
                            max_depth=MODEL_CONFIG["max_depth"],
                            min_samples_leaf=MODEL_CONFIG["min_samples_leaf"],
                            class_weight=MODEL_CONFIG["class_weight"],
                            random_state=SEED,
                            n_jobs=1,
                        ),
                    ),
                ]
            )
            candidate = CalibratedClassifierCV(
                estimator=base_pipeline,
                method="sigmoid",
                cv=TimeSeriesSplit(n_splits=3),
                n_jobs=1,
            )
            candidate.fit(x_train, y_train)
            try:
                persist_model(candidate, signature)
                MODEL_PERSISTENCE_STATUS = "SAVED"
            except OSError:
                MODEL_PERSISTENCE_STATUS = "SAVE_FAILED"
                logger.exception("Could not persist trained FraudShield model to %s.", MODEL_PATH)

        test_probabilities = positive_probability(candidate, x_test)
        predictions = [int(probability >= 0.5) for probability in test_probabilities]
        matrix = confusion_matrix(y_test, predictions, labels=[0, 1]).tolist()
        all_probabilities = positive_probability(candidate, x)
        MODEL = candidate
        MODEL_PROBABILITIES = {
            transaction["id"]: probability
            for transaction, probability in zip(TRANSACTIONS, all_probabilities)
        }
        MODEL_METRICS = {
            "status": "TRAINED",
            "training_rows": len(x_train),
            "test_rows": len(x_test),
            "positive_test_rows": int(sum(y_test)),
            "accuracy": round(float(accuracy_score(y_test, predictions)), 4),
            "precision": round(float(precision_score(y_test, predictions, zero_division=0)), 4),
            "recall": round(float(recall_score(y_test, predictions, zero_division=0)), 4),
            "f1": round(float(f1_score(y_test, predictions, zero_division=0)), 4),
            "roc_auc": round(float(roc_auc_score(y_test, test_probabilities)), 4),
            "confusion_matrix": matrix,
            "split": "75/25 chronological holdout; fixed-seed deterministic data",
            "note": "Synthetic labels and held-out demo predictions only; not real-world accuracy.",
        }
        importances = [
            estimator.estimator.named_steps["classifier"].feature_importances_
            for estimator in candidate.calibrated_classifiers_
        ]
        mean_importances = [
            sum(float(values[index]) for values in importances) / len(importances)
            for index in range(len(FEATURES))
        ]
        FEATURE_IMPORTANCES = sorted(
            [
                {"feature": feature, "importance": round(importance, 4)}
                for feature, importance in zip(FEATURES, mean_importances)
            ],
            key=lambda item: item["importance"],
            reverse=True,
        )
        MODEL_METRICS["persistence_status"] = MODEL_PERSISTENCE_STATUS
        if MODEL_PERSISTENCE_STATUS == "SAVE_FAILED":
            MODEL_METRICS["persistence_warning"] = (
                "Model trained for this run but could not be persisted; see API logs."
            )
    except Exception as error:
        MODEL = None
        MODEL_PROBABILITIES = {}
        FEATURE_IMPORTANCES = []
        MODEL_PERSISTENCE_STATUS = "TRAINING_FAILED"
        MODEL_METRICS = {
            "status": "NOT TRAINED",
            "reason": f"Model training/loading failed: {error}",
            "persistence_status": MODEL_PERSISTENCE_STATUS,
        }
        logger.exception("FraudShield model training/loading failed; baseline scoring remains available.")


def load_settings() -> dict[str, Any]:
    with connect_db() as db:
        row = db.execute("SELECT value FROM app_settings WHERE id = 1").fetchone()
    return json.loads(row["value"]) if row else json.loads(json.dumps(DEFAULT_SETTINGS))


def risk_signals(tx: dict[str, Any]) -> list[dict[str, Any]]:
    features = tx["features"]
    candidates = [
        ("amount", "Unusual transaction amount", features["amount_risk"], f"${tx['amount']:,.2f} is elevated for this demo profile."),
        ("velocity", "Elevated transaction velocity", min(features["velocity_1h"] / 6, 1), f"{features['velocity_1h']} earlier transactions from this account in the past hour."),
        ("new_recipient", "First-seen recipient", float(features["new_recipient"]), "This recipient has not appeared earlier in the demo stream."),
        ("rapid_transfer", "Rapid transfer pattern", float(features["rapid_transfer"]), "Multiple transfers were observed in a short interval."),
        ("night_transaction", "Unusual transaction hour", float(features["night_transaction"]), "The transaction occurred during overnight hours."),
        ("international", "Cross-border indicator", float(features["international"]), "The synthetic transaction is marked cross-border."),
    ]
    return [
        {
            "key": key,
            "label": label,
            "strength": round(float(strength), 2),
            "detail": (
                "This sender has not sent funds to this recipient earlier in the demo stream."
                if key == "new_recipient"
                else detail
            ),
        }
        for key, label, strength, detail in candidates
        if strength >= 0.25
    ]


def score_transaction(tx: dict[str, Any], settings: dict[str, Any]) -> dict[str, Any]:
    features = tx["features"]
    if MODEL is None:
        ml_probability = min(
            1.0,
            0.36 * features["amount_risk"]
            + 0.18 * min(features["velocity_1h"] / 6, 1)
            + 0.2 * features["new_recipient"]
            + 0.12 * features["rapid_transfer"]
            + 0.08 * features["night_transaction"]
            + 0.06 * features["international"],
        )
        model_source = "transparent_baseline"
    else:
        ml_probability = MODEL_PROBABILITIES[tx["id"]]
        model_source = "random_forest"

    weights = settings["weights"]
    signal_values = {
        "amount": features["amount_risk"],
        "velocity": min(features["velocity_1h"] / 6, 1),
        "new_recipient": features["new_recipient"],
        "rapid_transfer": features["rapid_transfer"],
        "night_transaction": features["night_transaction"],
        "international": features["international"],
    }
    total_weight = sum(weights.values())
    weighted_risk = (
        sum(weights[key] * signal_values[key] for key in weights) / total_weight
        if total_weight > 0
        else ml_probability
    )
    score = round(100 * (0.7 * ml_probability + 0.3 * weighted_risk))
    thresholds = settings["thresholds"]
    if score <= thresholds["low_max"]:
        category = "Low"
    elif score <= thresholds["medium_max"]:
        category = "Medium"
    elif score <= thresholds["high_max"]:
        category = "High"
    else:
        category = "Critical"
    signals = risk_signals(tx)
    if not signals:
        explanation = "No strong risk indicators were found among the available demo signals."
    else:
        explanation = "Risk estimate is driven by " + ", ".join(
            signal["label"].lower() for signal in signals[:3]
        ) + ". This is a synthetic-data demonstration, not a fraud determination."
    return {
        "risk_score": score,
        "risk_probability": round(ml_probability, 4) if MODEL is not None else None,
        "risk_category": category,
        "signals": signals,
        "explanation": explanation,
        "model_source": model_source,
    }


def public_transaction(tx: dict[str, Any], settings: dict[str, Any]) -> dict[str, Any]:
    scored = score_transaction(tx, settings)
    return {
        **{key: value for key, value in tx.items() if key not in ("features", "synthetic_label")},
        "features": {
            key: value for key, value in tx["features"].items() if key != "amount_risk"
        },
        **scored,
    }


def investigation_from_row(row: sqlite3.Row) -> dict[str, Any]:
    result = dict(row)
    for field in ("transaction_ids", "notes", "evidence", "timeline"):
        result[field] = json.loads(result[field])
    return result


class CaseCreate(BaseModel):
    title: str = Field(min_length=3, max_length=120)
    priority: Literal["Low", "Medium", "High", "Critical"] = "Medium"
    transaction_ids: list[str] = Field(default_factory=list, max_length=50)


class CaseUpdate(BaseModel):
    status: Literal["Open", "In Review", "Escalated", "Closed"] | None = None
    transaction_ids: list[str] | None = Field(default=None, max_length=50)


class NoteCreate(BaseModel):
    text: str = Field(min_length=1, max_length=2000)
    author: str = Field(default="Analyst", min_length=1, max_length=80)


class EvidenceCreate(BaseModel):
    transaction_id: str = Field(min_length=1, max_length=40)
    description: str = Field(default="", max_length=500)


class SettingsUpdate(BaseModel):
    thresholds: dict[str, int]
    weights: dict[str, float]


@app.get("/api/health")
def health() -> dict[str, Any]:
    return {
        "status": "ok",
        "mode": "DEMO MODE",
        "model_status": MODEL_METRICS["status"],
        "model_persistence": MODEL_PERSISTENCE_STATUS,
    }


@app.get("/api/transactions")
def get_transactions(
    search: str = "",
    risk: str = "",
    channel: str = "",
    offset: int = Query(default=0, ge=0),
    limit: int = Query(default=1500, ge=1, le=2000),
) -> dict[str, Any]:
    settings = load_settings()
    filtered = []
    needle = search.casefold().strip()
    for tx in TRANSACTIONS:
        public = public_transaction(tx, settings)
        if risk and risk.casefold() != public["risk_category"].casefold():
            continue
        if channel and channel.casefold() != tx["channel"].casefold():
            continue
        if needle and not any(
            needle in str(tx[field]).casefold() for field in ("id", "sender", "recipient")
        ):
            continue
        filtered.append(public)
    return {"items": filtered[offset : offset + limit], "total": len(filtered)}


@app.get("/api/transactions/{transaction_id}")
def get_transaction(transaction_id: str) -> dict[str, Any]:
    tx = next((item for item in TRANSACTIONS if item["id"] == transaction_id), None)
    if tx is None:
        raise HTTPException(status_code=404, detail="Transaction not found in demo dataset.")
    return public_transaction(tx, load_settings())


@app.post("/api/transactions/{transaction_id}/analyze")
def analyze_transaction(transaction_id: str) -> dict[str, Any]:
    return get_transaction(transaction_id)


@app.get("/api/overview")
def overview() -> dict[str, Any]:
    settings = load_settings()
    transactions = [public_transaction(tx, settings) for tx in TRANSACTIONS]
    by_day: dict[str, dict[str, int]] = defaultdict(lambda: {"transactions": 0, "flagged": 0})
    by_category = Counter()
    by_channel = Counter()
    by_region: dict[str, dict[str, float]] = defaultdict(
        lambda: {"transactions": 0, "risk_total": 0}
    )
    by_account: dict[str, dict[str, Any]] = defaultdict(
        lambda: {"account": "", "transactions": 0, "risk_total": 0}
    )
    for tx in transactions:
        day = tx["timestamp"][:10]
        by_day[day]["transactions"] += 1
        by_day[day]["flagged"] += int(tx["risk_score"] >= 56)
        by_category[tx["risk_category"]] += 1
        by_channel[tx["channel"]] += 1
        by_region[tx["region"]]["transactions"] += 1
        by_region[tx["region"]]["risk_total"] += tx["risk_score"]
        entry = by_account[tx["sender"]]
        entry["account"] = tx["sender"]
        entry["transactions"] += 1
        entry["risk_total"] += tx["risk_score"]
    for entry in by_account.values():
        entry["average_risk"] = round(entry["risk_total"] / entry["transactions"])
        del entry["risk_total"]
    high_risk = [tx for tx in transactions if tx["risk_score"] >= 56]
    return {
        "total_transactions": len(transactions),
        "flagged_transactions": len(high_risk),
        "flag_rate": round(100 * len(high_risk) / len(transactions), 1),
        "volume": round(sum(tx["amount"] for tx in transactions), 2),
        "average_risk": round(sum(tx["risk_score"] for tx in transactions) / len(transactions), 1),
        "risk_distribution": [
            {"name": name, "value": by_category[name]}
            for name in ("Low", "Medium", "High", "Critical")
        ],
        "trend": [
            {"date": day, **values}
            for day, values in sorted(by_day.items())
        ],
        "channel_distribution": [
            {"name": name.replace("_", " ").title(), "value": value}
            for name, value in by_channel.items()
        ],
        "regional_risk": [
            {
                "region": region,
                "transactions": int(values["transactions"]),
                "average_risk": round(values["risk_total"] / values["transactions"]),
            }
            for region, values in by_region.items()
        ],
        "customer_risk": sorted(
            by_account.values(), key=lambda item: item["average_risk"], reverse=True
        )[:8],
        "recent_alerts": sorted(high_risk, key=lambda item: item["timestamp"], reverse=True)[:8],
    }


@app.get("/api/model")
def model_insights() -> dict[str, Any]:
    return {
        **MODEL_METRICS,
        "algorithm": (
            "Calibrated Random Forest pipeline"
            if MODEL is not None
            else "Transparent rule-based baseline"
        ),
        "features": FEATURE_IMPORTANCES,
        "dataset_rows": len(TRANSACTIONS),
        "label_note": "Synthetic labels are generated from demo transaction patterns; they are not confirmed fraud.",
    }


@app.get("/api/network")
def network(transaction_id: str = "") -> dict[str, Any]:
    settings = load_settings()
    graph_transactions = TRANSACTIONS[-220:]
    selected = next((tx for tx in TRANSACTIONS if tx["id"] == transaction_id), None)
    if selected is not None and selected not in graph_transactions:
        graph_transactions = [*graph_transactions[1:], selected]
    scored = [(tx, public_transaction(tx, settings)) for tx in graph_transactions]
    nodes: dict[str, dict[str, Any]] = {}
    edges = []
    for tx, public in scored:
        for account in (tx["sender"], tx["recipient"]):
            if account not in nodes:
                nodes[account] = {"id": account, "risk": 0, "transactions": 0}
            nodes[account]["transactions"] += 1
            nodes[account]["risk"] = max(nodes[account]["risk"], public["risk_score"])
        edges.append(
            {
                "id": tx["id"],
                "source": tx["sender"],
                "target": tx["recipient"],
                "amount": tx["amount"],
                "risk": public["risk_score"],
                "category": public["risk_category"],
                "selected": tx["id"] == transaction_id,
            }
        )
    return {"nodes": list(nodes.values()), "edges": edges, "selected_transaction": transaction_id}


@app.get("/api/investigations")
def get_investigations() -> list[dict[str, Any]]:
    with connect_db() as db:
        rows = db.execute("SELECT * FROM investigations ORDER BY updated_at DESC").fetchall()
    return [investigation_from_row(row) for row in rows]


@app.post("/api/investigations", status_code=201)
def create_investigation(payload: CaseCreate) -> dict[str, Any]:
    available_ids = {tx["id"] for tx in TRANSACTIONS}
    if any(txid not in available_ids for txid in payload.transaction_ids):
        raise HTTPException(status_code=422, detail="Evidence must reference demo transaction IDs.")
    now = datetime.now(timezone.utc).isoformat()
    case_id = f"case_{uuid4().hex[:10]}"
    timeline = [{"at": now, "event": "Investigation created"}]
    with connect_db() as db:
        db.execute(
            """INSERT INTO investigations
            (id, title, status, priority, transaction_ids, notes, evidence, timeline, created_at, updated_at)
            VALUES (?, ?, 'Open', ?, ?, '[]', '[]', ?, ?, ?)""",
            (
                case_id,
                payload.title.strip(),
                payload.priority,
                json.dumps(payload.transaction_ids),
                json.dumps(timeline),
                now,
                now,
            ),
        )
        row = db.execute("SELECT * FROM investigations WHERE id = ?", (case_id,)).fetchone()
    return investigation_from_row(row)


@app.patch("/api/investigations/{case_id}")
def update_investigation(case_id: str, payload: CaseUpdate) -> dict[str, Any]:
    with connect_db() as db:
        row = db.execute("SELECT * FROM investigations WHERE id = ?", (case_id,)).fetchone()
        if row is None:
            raise HTTPException(status_code=404, detail="Investigation not found.")
        case = investigation_from_row(row)
        status = payload.status or case["status"]
        transaction_ids = payload.transaction_ids or case["transaction_ids"]
        if any(txid not in {tx["id"] for tx in TRANSACTIONS} for txid in transaction_ids):
            raise HTTPException(status_code=422, detail="Evidence must reference demo transaction IDs.")
        now = datetime.now(timezone.utc).isoformat()
        timeline = case["timeline"]
        if status != case["status"]:
            timeline.append({"at": now, "event": f"Status changed to {status}"})
        db.execute(
            "UPDATE investigations SET status=?, transaction_ids=?, timeline=?, updated_at=? WHERE id=?",
            (status, json.dumps(transaction_ids), json.dumps(timeline), now, case_id),
        )
        updated = db.execute("SELECT * FROM investigations WHERE id = ?", (case_id,)).fetchone()
    return investigation_from_row(updated)


@app.post("/api/investigations/{case_id}/notes")
def add_note(case_id: str, payload: NoteCreate) -> dict[str, Any]:
    with connect_db() as db:
        row = db.execute("SELECT * FROM investigations WHERE id = ?", (case_id,)).fetchone()
        if row is None:
            raise HTTPException(status_code=404, detail="Investigation not found.")
        case = investigation_from_row(row)
        now = datetime.now(timezone.utc).isoformat()
        case["notes"].append({"at": now, "author": payload.author.strip(), "text": payload.text.strip()})
        case["timeline"].append({"at": now, "event": "Analyst note added"})
        db.execute(
            "UPDATE investigations SET notes=?, timeline=?, updated_at=? WHERE id=?",
            (json.dumps(case["notes"]), json.dumps(case["timeline"]), now, case_id),
        )
        updated = db.execute("SELECT * FROM investigations WHERE id = ?", (case_id,)).fetchone()
    return investigation_from_row(updated)


@app.post("/api/investigations/{case_id}/evidence")
def add_evidence(case_id: str, payload: EvidenceCreate) -> dict[str, Any]:
    if not any(tx["id"] == payload.transaction_id for tx in TRANSACTIONS):
        raise HTTPException(status_code=422, detail="Evidence must reference a demo transaction.")
    with connect_db() as db:
        row = db.execute("SELECT * FROM investigations WHERE id = ?", (case_id,)).fetchone()
        if row is None:
            raise HTTPException(status_code=404, detail="Investigation not found.")
        case = investigation_from_row(row)
        now = datetime.now(timezone.utc).isoformat()
        entry = {
            "transaction_id": payload.transaction_id,
            "description": payload.description.strip(),
            "at": now,
        }
        if not any(item["transaction_id"] == payload.transaction_id for item in case["evidence"]):
            case["evidence"].append(entry)
        if payload.transaction_id not in case["transaction_ids"]:
            case["transaction_ids"].append(payload.transaction_id)
        case["timeline"].append({"at": now, "event": f"Evidence linked: {payload.transaction_id}"})
        db.execute(
            "UPDATE investigations SET evidence=?, transaction_ids=?, timeline=?, updated_at=? WHERE id=?",
            (
                json.dumps(case["evidence"]),
                json.dumps(case["transaction_ids"]),
                json.dumps(case["timeline"]),
                now,
                case_id,
            ),
        )
        updated = db.execute("SELECT * FROM investigations WHERE id = ?", (case_id,)).fetchone()
    return investigation_from_row(updated)


@app.get("/api/settings")
def get_app_settings() -> dict[str, Any]:
    return load_settings()


@app.put("/api/settings")
def update_settings(payload: SettingsUpdate) -> dict[str, Any]:
    thresholds = payload.thresholds
    if set(thresholds) != {"low_max", "medium_max", "high_max"}:
        raise HTTPException(status_code=422, detail="Provide low_max, medium_max, and high_max thresholds.")
    values = [thresholds["low_max"], thresholds["medium_max"], thresholds["high_max"]]
    if not (0 <= values[0] < values[1] < values[2] <= 100):
        raise HTTPException(status_code=422, detail="Thresholds must increase from 0 to 100.")
    if set(payload.weights) != set(DEFAULT_SETTINGS["weights"]):
        raise HTTPException(status_code=422, detail="Unsupported scoring weight keys.")
    if any(not math.isfinite(value) or value < 0 for value in payload.weights.values()):
        raise HTTPException(status_code=422, detail="Weights must be finite and non-negative.")
    if sum(payload.weights.values()) <= 0:
        raise HTTPException(status_code=422, detail="At least one scoring weight must be greater than zero.")
    updated = {"thresholds": thresholds, "weights": payload.weights}
    with connect_db() as db:
        db.execute(
            "INSERT OR REPLACE INTO app_settings(id, value) VALUES(1, ?)",
            (json.dumps(updated),),
        )
    return updated


@app.post("/api/reset")
def reset_demo() -> dict[str, str]:
    with connect_db() as db:
        db.execute("DELETE FROM investigations")
        db.execute(
            "INSERT OR REPLACE INTO app_settings(id, value) VALUES(1, ?)",
            (json.dumps(DEFAULT_SETTINGS),),
        )
    return {"status": "reset", "mode": "DEMO MODE"}
