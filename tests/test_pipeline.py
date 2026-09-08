import json
import sys
import tempfile
import unittest
from pathlib import Path


PROJECT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(PROJECT / "scripts"))

from guagua_pipeline import (  # noqa: E402
    DuplicateSnapshotError,
    analyze,
    import_exports,
    metric_bundle,
    safe_delta,
    save_snapshot,
    select_lifecycle_snapshot,
    write_json_atomic,
)


def make_project(root: Path, contents=None):
    contents = contents or [
        {
            "content_id": "A",
            "publish_date": "2026-09-01",
            "series": "系列甲",
            "topic": "主题甲",
            "title": "标题甲",
            "status": "published",
            "xiaohongshu_note_id": "note-a",
            "xiaohongshu_url": None,
            "content_type": "企业单拆",
            "title_type": "为什么型",
            "industry": "消费",
            "tags": [],
        }
    ]
    write_json_atomic(root / "data/content/content-master.json", {
        "schema_version": "1.0",
        "series": [{"series_id": "S1", "name": "系列甲", "color": "#123456", "order": 1}],
        "contents": contents,
    })


def note(snapshot_date, content_id="A", publish_date="2026-09-01", **values):
    row = {
        "snapshot_date": snapshot_date,
        "content_id": content_id,
        "note_id": f"note-{content_id.lower()}",
        "publish_date": publish_date,
        "impressions": None,
        "views": None,
        "likes": None,
        "favorites": None,
        "comments": None,
        "shares": None,
        "followers_gained": None,
    }
    row.update(values)
    return row


class PipelineTests(unittest.TestCase):
    def test_snapshot_delta_and_negative_correction(self):
        warnings = []
        self.assertEqual(safe_delta(120, 100, "A views", warnings), 20)
        self.assertIsNone(safe_delta(90, 100, "A views", warnings))
        self.assertEqual(len(warnings), 1)

    def test_lifecycle_selects_first_available_snapshot_after_threshold(self):
        snapshots = [note("2026-09-02", views=10), note("2026-09-04", views=30), note("2026-09-09", views=80)]
        self.assertEqual(select_lifecycle_snapshot(snapshots, "2026-09-01", 1)["views"], 10)
        self.assertEqual(select_lifecycle_snapshot(snapshots, "2026-09-01", 3)["views"], 30)
        self.assertEqual(select_lifecycle_snapshot(snapshots, "2026-09-01", 7)["views"], 80)
        self.assertIsNone(select_lifecycle_snapshot(snapshots, "2026-09-01", 30))
        self.assertIsNone(select_lifecycle_snapshot([note("2026-09-20", views=500)], "2026-09-01", 7))

    def test_missing_impressions_does_not_create_view_rate(self):
        bundle = metric_bundle(note("2026-09-02", views=100, likes=5))
        self.assertIsNone(bundle["view_rate"])
        self.assertEqual(bundle["like_rate"], 0.05)
        self.assertIsNone(bundle["interactions"])

    def test_duplicate_snapshot_is_never_overwritten(self):
        with tempfile.TemporaryDirectory() as temp:
            target = Path(temp) / "2026-09-08.json"
            first = {"snapshot_date": "2026-09-08", "notes": [{"views": 10}]}
            changed = {"snapshot_date": "2026-09-08", "notes": [{"views": 11}]}
            self.assertEqual(save_snapshot(target, first), "created")
            with self.assertRaises(DuplicateSnapshotError):
                save_snapshot(target, changed)
            self.assertEqual(json.loads(target.read_text())["notes"][0]["views"], 10)

    def test_series_aggregation_and_fair_24h_ranking(self):
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            contents = [
                {"content_id": "A", "publish_date": "2026-09-01", "series": "系列甲", "topic": "新内容", "title": "新内容", "status": "published", "xiaohongshu_note_id": "note-a", "xiaohongshu_url": None, "content_type": "企业单拆", "title_type": "为什么型", "industry": "消费", "tags": []},
                {"content_id": "B", "publish_date": "2026-08-01", "series": "系列甲", "topic": "旧内容", "title": "旧内容", "status": "published", "xiaohongshu_note_id": "note-b", "xiaohongshu_url": None, "content_type": "企业单拆", "title_type": "对比型", "industry": "消费", "tags": []},
            ]
            make_project(root, contents)
            write_json_atomic(root / "local-data/raw/notes/2026-09-02.json", {"notes": [note("2026-09-02", "A", "2026-09-01", views=100, favorites=10)]})
            write_json_atomic(root / "local-data/raw/notes/2026-08-02.json", {"notes": [note("2026-08-02", "B", "2026-08-01", views=50, favorites=2)]})
            write_json_atomic(root / "local-data/raw/notes/2026-09-02-latest.json", {"notes": [note("2026-09-02", "B", "2026-08-01", views=1000, favorites=30)]})
            analyze(root)
            content_metrics = json.loads((root / "data/derived/content-metrics.json").read_text())
            self.assertEqual(content_metrics["rankings"]["24h"]["views"][0]["content_id"], "A")
            series_metrics = json.loads((root / "data/derived/series-metrics.json").read_text())
            self.assertEqual(series_metrics["series"][0]["sample_size"], 2)

    def test_non_consecutive_snapshots_do_not_create_daily_delta(self):
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            make_project(root)
            write_json_atomic(root / "local-data/raw/notes/2026-09-02.json", {"notes": [note("2026-09-02", views=100)]})
            write_json_atomic(root / "local-data/raw/notes/2026-09-05.json", {"notes": [note("2026-09-05", views=180)]})
            analyze(root)
            payload = json.loads((root / "data/derived/content-metrics.json").read_text())
            self.assertIsNone(payload["contents"][0]["deltas"]["views"])
            self.assertTrue(any("不连续" in warning for warning in payload["warnings"]))

    def test_period_total_account_snapshot_is_not_summed_again(self):
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            make_project(root)
            write_json_atomic(root / "local-data/raw/account/2026-09-08.json", {"account": {
                "date": "2026-09-08",
                "period_start": "2026-09-02",
                "period_end": "2026-09-08",
                "metric_window": "period_total",
                "impressions": 7000,
                "views": 2100,
                "new_followers": 14,
            }})
            analyze(root)
            summary = json.loads((root / "data/derived/account-summary.json").read_text())
            self.assertEqual(summary["last_7_days"]["views"], 2100)
            self.assertEqual(summary["last_7_days"]["new_followers"], 14)
            self.assertEqual(summary["last_7_days"]["metric_window"], "period_total")

    def test_csv_import_generates_snapshot_and_derived_files(self):
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            make_project(root)
            imports = root / "imports"
            imports.mkdir()
            (imports / "notes.csv").write_text(
                "采集日期,内容编号,发布日期,曝光量,观看次数,点赞数,收藏数,评论数,分享数,涨粉人数\n"
                "2026-09-08,A,2026-09-01,1000,400,20,30,4,2,3\n",
                encoding="utf-8",
            )
            (imports / "account.csv").write_text(
                "采集日期,指标口径,周期开始,周期结束,总粉丝,曝光量,观看次数,新增粉丝\n"
                "2026-09-08,区间合计,2026-09-02,2026-09-08,128,7000,2100,14\n",
                encoding="utf-8",
            )
            imported = import_exports(root, imports)
            self.assertEqual(imported["snapshots"][0]["status"], "created")
            analyze(root)
            self.assertTrue((root / "data/derived/content-metrics.json").exists())
            summary = json.loads((root / "data/derived/account-summary.json").read_text())
            self.assertEqual(summary["last_7_days"]["views"], 2100)


if __name__ == "__main__":
    unittest.main()
