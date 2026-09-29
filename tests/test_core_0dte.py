import unittest

import core_0dte


class Core0DTEUniverseTests(unittest.TestCase):
    def test_core_universe_contains_liquid_0dte_etfs(self):
        self.assertEqual(
            set(core_0dte.CORE_0DTE),
            {"SPY", "QQQ", "IWM", "SMH", "GLD", "XLF"},
        )


if __name__ == "__main__":
    unittest.main()
