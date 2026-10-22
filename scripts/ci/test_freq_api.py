#!/usr/bin/env python3
"""Pruebas de la API estática por frecuencia (scripts/build-freq-api.py). Sin dependencias: python scripts/ci/test_freq_api.py"""
from __future__ import annotations

import importlib.util
import json
import tempfile
import unittest
from pathlib import Path

_PATH = Path(__file__).resolve().parent.parent / "build-freq-api.py"
_spec = importlib.util.spec_from_file_location("freq_api", _PATH)
m = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(m)


def node(**kw):
    base = {"signal": "TEST", "nombre": "", "banda": "VHF/FM", "rx": "", "tx": "", "region": "", "serviceType": "",
            "isEcholink": False, "isDMR": False, "isAir": False, "color": "", "slot": "", "tg": "",
            "propagationPgw": "x", "propagationDcf": "y"}
    base.update(kw)
    return base


SW = {
    "meta": {"season": "A26"},
    "langs": {"S": "Español"},
    "targets": {"SAm": "Sudamérica"},
    "countries": {"ARG": "Argentina"},
    "sites": [["ARG", "g", "General Pacheco", -34.45, -58.62, "site"]],
    "stations": [["RAE", "ARG"]],
    "days": [{"t": "d"}, {"t": "w", "m": 31}],
    "entries": [
        [15345, 1320, 120, 1, 0, "S", "SAm", 0, 0, None, None, "0926"],
        [15345, 600, 720, 0, 0, "S", "SAm", 0, 5, "2026-04-01", None, None],
        [7220.7, 0, 1440, 0, 0, "", "", 0, 0, None, None, None],
    ],
}


class Units(unittest.TestCase):
    def test_am_is_khz(self):
        self.assertEqual(m.node_value_khz(node(banda="AM", tx="720"), "tx"), 720)

    def test_mhz_bands(self):
        self.assertEqual(m.node_value_khz(node(banda="VHF/FM", rx="146.730"), "rx"), 146730)
        self.assertEqual(m.node_value_khz(node(banda="FM", tx="93.5"), "tx"), 93500)
        self.assertEqual(m.node_value_khz(node(banda="HF", rx="7.148"), "rx"), 7148)
        self.assertEqual(m.node_value_khz(node(banda="UHF/FM", rx="446.00625"), "rx"), 446006.25)

    def test_empty(self):
        self.assertIsNone(m.node_value_khz(node(rx=""), "rx"))
        self.assertIsNone(m.node_value_khz(node(rx=None), "rx"))

    def test_out_of_range_fails(self):
        with self.assertRaises(ValueError):
            m.node_value_khz(node(banda="AM", tx="93.5"), "tx")  # FM cargado como AM
        with self.assertRaises(ValueError):
            m.node_value_khz(node(banda="FM", tx="720"), "tx")  # AM cargado como FM

    def test_rounding(self):
        self.assertEqual(m.round_khz(446006.25), 446006)
        self.assertEqual(m.round_khz(446018.75), 446019)
        self.assertEqual(m.round_khz(7220.5), 7221)  # mitades hacia arriba
        self.assertEqual(m.round_khz(6.5), 7)
        # canales PMR446 de 6,25 kHz no colisionan al redondear
        pmr = [446000 + 6.25 * (2 * i + 1) for i in range(16)]
        self.assertEqual(len({m.round_khz(f) for f in pmr}), 16)


class Stations(unittest.TestCase):
    def test_repeater_indexed_under_rx_and_tx(self):
        idx = m.index_nodes([node(rx="146.730", tx="146.130")])
        self.assertEqual(idx[146730][0]["matchedOn"], ["rx"])
        self.assertEqual(idx[146130][0]["matchedOn"], ["tx"])

    def test_simplex_deduped(self):
        idx = m.index_nodes([node(banda="HF", rx="7.148", tx="7.148", region="GLOBAL")])
        self.assertEqual(list(idx), [7148])
        self.assertEqual(len(idx[7148]), 1)
        self.assertEqual(idx[7148][0]["matchedOn"], ["rx", "tx"])
        self.assertEqual(idx[7148][0]["category"], "global")

    def test_payload_whitelist_and_empties(self):
        p = m.index_nodes([node(signal="CE3X/P", rx="145.000", serviceType="", notes="")])[145000][0]
        for hidden in ("propagationPgw", "propagationDcf", "isAir", "serviceType", "color", "notes", "rx", "tx"):
            self.assertNotIn(hidden, p)
        self.assertEqual(p["url"], "https://www.radiomap.cl/?signal=CE3X%2FP")
        self.assertNotIn("txKHz", p)

    def test_dmr_block(self):
        p = m.index_nodes([node(banda="UHF/DMR", rx="439.100", isDMR=True, color="1", slot="2", tg="730")])[439100][0]
        self.assertEqual(p["dmr"], {"colorCode": "1", "slot": "2", "tg": "730"})

    def test_categories(self):
        self.assertEqual(m.category_of(node(serviceType="atc")), "atc")
        self.assertEqual(m.category_of(node(serviceType="broadcast")), "broadcast")
        self.assertEqual(m.category_of(node()), "amateur")

    def test_bad_frequency_aborts_build(self):
        with self.assertRaises(SystemExit):
            m.index_nodes([node(banda="AM", tx="99.9")])


class Shortwave(unittest.TestCase):
    def test_entries_expanded(self):
        idx = m.index_shortwave(SW)
        self.assertEqual(sorted(idx), [7221, 15345])
        first, second = idx[15345]
        self.assertEqual((first["startUTC"], first["endUTC"]), ("1000", "1200"))  # ordenado por inicio
        self.assertEqual(second["days"], {"t": "w", "m": 31})
        self.assertEqual(second["lastHeard"], "0926")
        self.assertEqual(first["validFrom"], "2026-04-01")
        self.assertEqual(first["season"], 5)
        self.assertEqual(first["country"], "Argentina")
        self.assertEqual(first["langLabel"], "Español")
        self.assertEqual(first["targetLabel"], "Sudamérica")
        self.assertEqual(first["site"]["name"], "General Pacheco")
        self.assertEqual(idx[7221][0]["kHz"], 7220.7)
        self.assertNotIn("lang", idx[7221][0])
        self.assertEqual(idx[7221][0]["endUTC"], "2400")


class Build(unittest.TestCase):
    def test_build_into_temp_dir(self):
        nodes = [
            node(signal="CE1RCD RPT-A", rx="146.730", tx="146.130"),
            node(signal="CA-072", banda="AM", tx="720", serviceType="broadcast"),
        ]
        with tempfile.TemporaryDirectory() as d:
            out = Path(d) / "v1"
            (out / "freq").mkdir(parents=True)
            (out / "freq" / "1.json").write_text("{}")  # restos de un build anterior
            index = m.build(nodes, SW, "9.9.9", out, generated="2026-01-01T00:00:00Z")
            self.assertFalse((out / "freq" / "1.json").exists())
            self.assertEqual(index["freqs"], [720, 7221, 15345, 146130, 146730])
            self.assertEqual(index["counts"], {"freqs": 5, "stations": 3, "shortwave": 3})
            self.assertEqual(json.loads((out / "index.json").read_text(encoding="utf-8")), index)
            f = json.loads((out / "freq" / "146730.json").read_text(encoding="utf-8"))
            self.assertEqual((f["kHz"], f["version"]), (146730, "9.9.9"))
            self.assertEqual(f["stations"][0]["signal"], "CE1RCD RPT-A")
            self.assertEqual(f["shortwave"], [])
            self.assertEqual(len(json.loads((out / "freq" / "15345.json").read_text(encoding="utf-8"))["shortwave"]), 2)

    def test_real_data_builds(self):
        """Los datos versionados (data/data.js + data/shortwave.js) generan la API sin errores."""
        nodes = m.load_js_json(m.DATA_JS, "NODES")
        sw = m.load_js_json(m.SHORTWAVE_JS, "SHORTWAVE") if m.SHORTWAVE_JS.exists() else None
        with tempfile.TemporaryDirectory() as d:
            index = m.build(nodes, sw, m.load_version(m.DATA_JS), Path(d) / "v1")
        self.assertGreater(index["counts"]["stations"], len(nodes) // 2)
        self.assertNotEqual(index["version"], "dev")


if __name__ == "__main__":
    unittest.main(verbosity=1)
