#!/usr/bin/env python3
"""Pruebas del mapeador EiBi → SHORTWAVE (scripts/eibi-to-shortwavejs.py). Sin dependencias: python scripts/ci/test_eibi_mapper.py"""
from __future__ import annotations

import importlib.util
import re
import unittest
from pathlib import Path

_PATH = Path(__file__).resolve().parent.parent / "eibi-to-shortwavejs.py"
_spec = importlib.util.spec_from_file_location("eibi_mapper", _PATH)
m = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(m)

README = """How to use EiBi frequency lists.
   I)   Language codes.
   II)  Country codes.
   III) Target-area codes.
   IV)  Transmitter-site codes.

   I) Language codes.
   E     English: UK (60m), USA (225m), India (200m), others                 [eng]
   S     Spanish: Spain, Latin America (330m)                                [spa]
   ZZ    Zzzish (1m)                                                         [zzz]

   II) Country codes.
   CHL  Chile
   CYP  Cyprus
   G    United Kingdom
   OMA  Oman
   TWN  Taiwan
   CLA  Clandestine stations *

   III) Target-area codes.
   Am  - America(s)
   Eu  - Europe (often including North Africa/Middle East)

   IV) Transmitter site codes.
   One-letter or two-letter codes.

   CHL: a-Antofagasta 23S40-70W24
        pm-Puerto Montt 41S39'20"-73W10'24"
   CYP: Zygi 34N43-33E19
   G:   w-Woofferton 52N18-02W43
        cp-London-Crystal Palace 51N25-00W05
   OMA: a-A'Seela 21N55-59E37
   TWN: k-Kouhu 23N32-120E10
        p-Paochung 23N43-120E18
"""

HEADER = "kHz:75;Time(UTC):93;Days:59;ITU:49;Station:201;Lng:49;Target:62;Remarks:135;P:35;Start:60;Stop:60;"


def run(rows: list[str], header: str = HEADER, utility=None):
    readme = m.parse_readme(README)
    return m.convert("\n".join([header] + rows), readme, {}, utility or [], ("A", 2026))


class HeaderMapping(unittest.TestCase):
    def test_width_suffix_and_parens_stripped(self):
        self.assertEqual(m.normalize_header_cell("Time(UTC):93"), "time")
        self.assertEqual(m.normalize_header_cell(" kHz:75 "), "khz")

    def test_reordered_and_renamed_columns_give_same_entries(self):
        base = run(["9730;1600-1630;;VTN;Voice of Vietnam;E;Eu;/G-w;1;;"])["data"]["entries"]
        header = "Station;Site;kHz;Time;Language;Target;ITU;P;Days;Start;Stop;Extra"
        alt = run(["Voice of Vietnam;/G-w;9730;1600-1630;E;Eu;VTN;1;;;;junk"], header=header)
        self.assertEqual(alt["data"]["entries"], base)
        self.assertTrue(any("Extra" in w for w in alt["report"]["warnings"]))

    def test_missing_required_column_raises(self):
        with self.assertRaises(m.MapperError):
            run(["9730;1600-1630;;VTN;E;Eu;/G-w;1;;"],
                header="kHz;Time;Days;ITU;Lng;Target;Remarks;P;Start;Stop")

    def test_short_rows_are_padded(self):
        res = run(["9730;1600-1630;;G;BBC;E;Eu;w;1"])
        self.assertEqual(res["report"]["kept"], 1)


class Decoding(unittest.TestCase):
    def test_latin1_fallback(self):
        text = m.decode_bytes("Rádio Nacional\r\n".encode("latin-1"))
        self.assertEqual(text, "Rádio Nacional\n")

    def test_utf8_preferred(self):
        self.assertEqual(m.decode_bytes("España".encode("utf-8")), "España")


class Fields(unittest.TestCase):
    def test_time(self):
        self.assertEqual(m.parse_time("0000-2400"), (0, 1440))
        self.assertEqual(m.parse_time("2330-0450"), (1410, 290))
        self.assertIsNone(m.parse_time("25:00"))
        self.assertIsNone(m.parse_time("2460-0100"))

    def test_persistence_utility_offset(self):
        self.assertEqual(m.parse_persistence("1"), (1, False))
        self.assertEqual(m.parse_persistence("96"), (6, True))
        self.assertIsNone(m.parse_persistence(""))

    def test_ddmm_and_last_heard(self):
        self.assertEqual(m.parse_ddmm("3006[0725]"), (30, 6))
        self.assertEqual(m.parse_ddmm("3107f"), (31, 7))
        self.assertIsNone(m.parse_ddmm("[0923]"))
        self.assertIsNone(m.parse_ddmm("3213"))
        self.assertEqual(m.parse_last_heard("3006[0725]"), "0725")
        self.assertIsNone(m.parse_last_heard("3006"))

    def test_days(self):
        self.assertEqual(m.parse_days(""), {"t": "d"})
        self.assertEqual(m.parse_days("Mo-Fr"), {"t": "w", "m": 0b0011111})
        self.assertEqual(m.parse_days("We-Mo"), {"t": "w", "m": 0b1111101})  # sin martes
        self.assertEqual(m.parse_days("Tu,Th"), {"t": "w", "m": 0b0001010})
        self.assertEqual(m.parse_days("SaSu"), {"t": "w", "m": 0b1100000})
        self.assertEqual(m.parse_days("156"), {"t": "w", "m": 0b0110001})
        self.assertEqual(m.parse_days("1.Sa"), {"t": "n", "n": 1, "wd": 5})
        self.assertEqual(m.parse_days("Last7"), {"t": "l", "wd": 6})
        self.assertEqual(m.parse_days("15Sep"), {"t": "date", "d": 15, "m": 9})
        self.assertEqual(m.parse_days("irr"), {"t": "irr"})
        self.assertEqual(m.parse_days("Test"), {"t": "irr"})
        self.assertEqual(m.parse_days("altFr")["t"], "irr")
        self.assertIn("raw", m.parse_days("altFr"))
        for token in ("alt", "harm", "imod", "spur", "LSB", "USB"):
            self.assertIsNone(m.parse_days(token), token)

    def test_site_code_forms(self):
        self.assertEqual(m.parse_site_code("", "G"), ("G", None))
        self.assertEqual(m.parse_site_code("w", "G"), ("G", "w"))
        self.assertEqual(m.parse_site_code("-pr", "USA"), ("USA", "pr"))
        self.assertEqual(m.parse_site_code("/CYP", "G"), ("CYP", None))
        self.assertEqual(m.parse_site_code("/OMA-a", "G"), ("OMA", "a"))

    def test_coords(self):
        self.assertEqual(m.parse_coord("23S40-70W24"), (-23.6667, -70.4))
        lat, lon = m.parse_coord("41S39'20\"-73W10'24\"")
        self.assertAlmostEqual(lat, -41.6556, places=3)
        self.assertAlmostEqual(lon, -73.1733, places=3)
        self.assertIsNone(m.parse_coord("unknown location"))


class Readme(unittest.TestCase):
    def setUp(self):
        self.r = m.parse_readme(README)

    def test_tables(self):
        self.assertEqual(self.r["langs"]["E"], "English")
        self.assertEqual(self.r["countries"]["CLA"], "Clandestine stations")
        self.assertEqual(self.r["targets"]["Am"], "America(s)")
        self.assertEqual(self.r["sites"][("CHL", "pm")]["name"], "Puerto Montt")
        self.assertEqual(self.r["defaults"]["CYP"]["name"], "Zygi")

    def test_resolution_chain(self):
        self.assertEqual(m.resolve_site("G", "w", self.r, {})[1], "site")
        self.assertEqual(m.resolve_site("CYP", None, self.r, {})[1], "site")
        s, prec = m.resolve_site("TWN", None, self.r, {})  # sin sitio por defecto → primer sitio del país
        self.assertEqual((s["name"], prec), ("Kouhu", "country"))
        self.assertIsNone(m.resolve_site("XUU", None, self.r, {}))
        ov = {("TWN", ""): {"name": "Override", "coord": (1.0, 2.0)}}
        self.assertEqual(m.resolve_site("TWN", None, self.r, ov)[0]["name"], "Override")


class Convert(unittest.TestCase):
    def test_filters(self):
        res = run([
            "9730;1600-1630;;G;BBC;E;Eu;w;1;;",           # ok
            "1386;1830-1900;;G;BBC;R;EEu;/CYP;1;;",       # onda media
            "9731;1600-1630;;G;BBC;E;Eu;w;8;;",           # inactiva
            "5000;0000-2400;;G;Time;-TS;Eu;w;1;;",        # utilitaria por idioma
            "9732;1600-1630;;G;BBC;E;Eu;w;91;;",          # utilitaria por P
            "9733;1600-1630;;G;Shannon Volmet;E;Eu;w;1;;",  # utilitaria por patrón
            "9734;1600-1630;alt;G;BBC;E;Eu;w;1;;",        # no es emisión
            "9735;1600-1630;;XUU;Unknown;E;Eu;;1;;",      # sin sitio
            "bad;1600-1630;;G;BBC;E;Eu;w;1;;",            # inválida
        ], utility=[re.compile("Volmet", re.I)])
        self.assertEqual(res["report"]["kept"], 1)
        self.assertEqual(res["report"]["skipped"], {
            "band": 1, "inactive": 1, "utility": 3, "notBroadcast": 1, "noSite": 1, "invalid": 1})

    def test_entry_shape_season_and_validity(self):
        res = run([
            "9730;1600-1630;Mo-Fr;G;BBC;S;Am;/CYP;6;2903;3006[0725]",
            "9740;2330-0100;;TWN;Sound of Hope;M;FE;;5;;",
        ])
        d = res["data"]
        e1, e2 = d["entries"]
        self.assertEqual(e1[0:3], [9730, 960, 990])
        self.assertEqual(d["days"][e1[3]], {"t": "w", "m": 31})
        self.assertEqual(d["stations"][e1[4]], ["BBC", "G"])
        self.assertEqual(e1[5:7], ["S", "Am"])
        self.assertEqual(d["sites"][e1[7]][:3], ["CYP", None, "Zygi"])
        self.assertEqual(e1[8:], [0, "2026-03-29", "2026-06-30", "0725"])
        self.assertEqual(e2[8], 5)
        self.assertEqual(d["sites"][e2[7]][5], "country")
        self.assertEqual(d["sites"][e2[7]][2], "Taiwan")  # rotulado con el país, no con un sitio adivinado
        self.assertEqual(d["langs"]["S"], "Español")
        self.assertEqual(d["targets"]["Am"], "América")

    def test_combined_language_codes_emit_each_name(self):
        d = run(["6000;0000-0100;;CHL;X;S,Q;SAm;a;1;;"])["data"]
        self.assertEqual(d["entries"][0][5], "S,Q")
        self.assertEqual(d["langs"]["S"], "Español")
        self.assertEqual(d["langs"]["Q"], "Quechua")
        self.assertNotIn("S,Q", d["langs"])

    def test_winter_season_dates_cross_new_year(self):
        self.assertEqual(m.iso_date((15, 1), ("B", 2026)), "2027-01-15")
        self.assertEqual(m.iso_date((15, 11), ("B", 2026)), "2026-11-15")

    def test_output_is_deterministic(self):
        rows = ["9730;1600-1630;;G;BBC;E;Eu;w;1;;", "6000;0000-0100;;CHL;X;S;SAm;a;1;;"]
        self.assertEqual(run(rows)["data"], run(list(reversed(rows)))["data"])

    def test_real_source_parses_if_present(self):
        src = sorted((m.SOURCE_DIR).glob("sked-*.csv"))
        readme_path = m.SOURCE_DIR / "README.TXT"
        if not src or not readme_path.exists():
            self.skipTest("sin fuente EiBi")
        readme = m.parse_readme(m.decode_bytes(readme_path.read_bytes()))
        self.assertGreater(len(readme["sites"]), 500)
        res = m.convert(m.decode_bytes(src[0].read_bytes()), readme, m.load_overrides(m.OVERRIDES_PATH),
                        m.load_utility_patterns(m.UTILITY_PATTERNS_PATH), m.season_from_filename(src[0].name))
        rep = res["report"]
        self.assertGreater(rep["kept"], 1000)
        self.assertLessEqual(rep["skipped"]["invalid"] / rep["totalRows"], m.MAX_BAD_ROW_RATIO)


if __name__ == "__main__":
    unittest.main(verbosity=1)
