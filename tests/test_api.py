from fastapi.testclient import TestClient
from sklearn.metrics import f1_score, precision_score, recall_score

from backend import app as service


def test_dataset_is_reproducible_and_uses_prediction_time_features() -> None:
    first = service.make_dataset()
    second = service.make_dataset()
    assert len(first) == 1500
    assert [tx["id"] for tx in first] == [tx["id"] for tx in second]
    assert [tx["synthetic_label"] for tx in first] == [tx["synthetic_label"] for tx in second]
    assert set(service.FEATURES).issubset(first[0]["features"])
    assert "synthetic_label" not in service.public_transaction(first[0], service.DEFAULT_SETTINGS)
    timestamps = [tx["timestamp"] for tx in first]
    assert timestamps == sorted(timestamps)


def test_api_model_analysis_and_case_lifecycle(tmp_path, monkeypatch) -> None:
    monkeypatch.setattr(service, "DATABASE_PATH", tmp_path / "fraudshield-test.db")
    monkeypatch.setattr(service, "MODEL_PATH", tmp_path / "fraudshield-model.joblib")
    with TestClient(service.app) as client:
        health = client.get("/api/health")
        assert health.status_code == 200
        assert health.json()["mode"] == "DEMO MODE"
        preflight = client.options(
            "/api/overview",
            headers={
                "Origin": "http://127.0.0.1:5174",
                "Access-Control-Request-Method": "GET",
            },
        )
        assert preflight.status_code == 200
        assert preflight.headers["access-control-allow-origin"] == "http://127.0.0.1:5174"

        records = client.get("/api/transactions?limit=10").json()
        assert records["total"] == 1500
        assert len(records["items"]) == 10
        tx = records["items"][0]
        assert 0 <= tx["risk_score"] <= 100
        assert tx["risk_category"] in {"Low", "Medium", "High", "Critical"}
        assert tx["risk_probability"] is not None
        assert 0 <= tx["risk_probability"] <= 1
        assert isinstance(tx["explanation"], str) and tx["explanation"]
        assert "synthetic_label" not in tx
        analysis = client.post(f"/api/transactions/{tx['id']}/analyze")
        assert analysis.status_code == 200
        assert analysis.json()["id"] == tx["id"]

        model = client.get("/api/model").json()
        assert model["dataset_rows"] == 1500
        assert model["test_rows"] == 375
        if model["status"] == "TRAINED":
            assert sum(map(sum, model["confusion_matrix"])) == model["test_rows"]
            assert 0 <= model["precision"] <= 1
            assert 0 <= model["recall"] <= 1
            assert model["positive_test_rows"] >= 10
            features = [service.feature_vector(item) for item in service.TRANSACTIONS]
            labels = [item["synthetic_label"] for item in service.TRANSACTIONS]
            split_index = int(len(features) * 0.75)
            x_test, y_test = features[split_index:], labels[split_index:]
            assert model["training_rows"] == split_index
            probabilities = service.positive_probability(service.MODEL, x_test)
            predictions = [int(probability >= 0.5) for probability in probabilities]
            assert model["positive_test_rows"] == sum(y_test)
            assert model["precision"] == round(
                float(precision_score(y_test, predictions, zero_division=0)), 4
            )
            assert model["recall"] == round(float(recall_score(y_test, predictions, zero_division=0)), 4)
            assert model["f1"] == round(float(f1_score(y_test, predictions, zero_division=0)), 4)
            assert model["persistence_status"] == "SAVED"
            assert (tmp_path / "fraudshield-model.joblib").is_file()
            original_prediction = service.MODEL_PROBABILITIES[tx["id"]]
            service.MODEL = None
            service.train_model()
            assert service.MODEL is not None
            assert service.MODEL_PERSISTENCE_STATUS == "LOADED"
            assert service.MODEL_PROBABILITIES[tx["id"]] == original_prediction

        created = client.post(
            "/api/investigations",
            json={"title": "Review synthetic transfer", "priority": tx["risk_category"], "transaction_ids": [tx["id"]]},
        )
        assert created.status_code == 201
        case_id = created.json()["id"]
        note = client.post(
            f"/api/investigations/{case_id}/notes",
            json={"text": "Review connected account activity."},
        )
        assert note.status_code == 200
        assert note.json()["notes"][0]["text"] == "Review connected account activity."
        evidence = client.post(
            f"/api/investigations/{case_id}/evidence",
            json={"transaction_id": tx["id"], "description": "Selected demo record"},
        )
        assert evidence.status_code == 200
        assert evidence.json()["evidence"][0]["transaction_id"] == tx["id"]
        updated = client.patch(f"/api/investigations/{case_id}", json={"status": "In Review"})
        assert updated.status_code == 200
        assert updated.json()["status"] == "In Review"
        assert any("Status changed" in event["event"] for event in updated.json()["timeline"])

        settings = client.get("/api/settings").json()
        settings["thresholds"] = {"low_max": 25, "medium_max": 50, "high_max": 75}
        saved = client.put("/api/settings", json=settings)
        assert saved.status_code == 200
        invalid = client.put(
            "/api/settings",
            json={"thresholds": {"low_max": 70, "medium_max": 40, "high_max": 90}, "weights": settings["weights"]},
        )
        assert invalid.status_code == 422
        assert client.post("/api/reset").status_code == 200
        assert client.get("/api/investigations").json() == []
        assert client.get("/api/settings").json() == service.DEFAULT_SETTINGS


def test_investigations_persist_between_api_sessions(tmp_path, monkeypatch) -> None:
    monkeypatch.setattr(service, "DATABASE_PATH", tmp_path / "persistent-test.db")
    monkeypatch.setattr(service, "MODEL_PATH", tmp_path / "persistent-model.joblib")
    with TestClient(service.app) as first_client:
        created = first_client.post(
            "/api/investigations",
            json={"title": "Persistent demo case", "priority": "High", "transaction_ids": []},
        )
        assert created.status_code == 201
        case_id = created.json()["id"]

    with TestClient(service.app) as second_client:
        saved_cases = second_client.get("/api/investigations").json()
        assert any(item["id"] == case_id for item in saved_cases)
