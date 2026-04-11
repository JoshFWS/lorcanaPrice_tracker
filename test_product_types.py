#!/usr/bin/env python3
"""Unit tests for product type detection and filtering."""

import unittest

from tracker.product_types import (
    detect_product_type,
    is_result_relevant,
    is_price_reasonable,
)


class TestDetectProductType(unittest.TestCase):

    def test_booster_box_from_search_terms(self):
        result = detect_product_type(
            "Disney Lorcana Winterspell booster box display 24 pack",
            "Winterspell Booster Box",
        )
        self.assertEqual(result, "booster_box")

    def test_booster_box_from_name_only(self):
        result = detect_product_type("", "Winterspell Booster Box")
        self.assertEqual(result, "booster_box")

    def test_trove(self):
        result = detect_product_type(
            "Disney Lorcana Winterspell Illumineer's Trove",
            "Winterspell Illumineer's Trove",
        )
        self.assertEqual(result, "trove")

    def test_single_card(self):
        result = detect_product_type(
            "Lorcana Scar Mastermind card",
            "Scar - Mastermind",
        )
        self.assertEqual(result, "single_card")

    def test_booster_pack(self):
        result = detect_product_type(
            "Disney Lorcana booster pack single",
            "Winterspell Booster Pack",
        )
        self.assertEqual(result, "booster_pack")

    def test_starter_deck(self):
        result = detect_product_type(
            "Disney Lorcana starter deck",
            "Winterspell Starter Deck",
        )
        self.assertEqual(result, "starter_deck")

    def test_gift_set(self):
        result = detect_product_type(
            "Disney Lorcana gift set",
            "Winterspell Gift Set",
        )
        self.assertEqual(result, "gift_set")

    def test_unknown_fallback(self):
        result = detect_product_type("something random", "Random Product")
        self.assertEqual(result, "unknown")

    def test_booster_box_takes_priority_over_card(self):
        """'booster box' should match before 'card' even if both present."""
        result = detect_product_type(
            "Disney Lorcana booster box card game",
            "Booster Box",
        )
        self.assertEqual(result, "booster_box")


class TestIsResultRelevant(unittest.TestCase):

    def test_booster_box_result_is_relevant(self):
        self.assertTrue(is_result_relevant(
            title="Winterspell Booster Box - $110.00",
            snippet="Buy Disney Lorcana Winterspell booster box display",
            url="https://example.com/product/12345",
            product_type="booster_box",
            search_terms="Disney Lorcana Winterspell booster box",
        ))

    def test_single_card_result_rejected_for_booster_box(self):
        self.assertFalse(is_result_relevant(
            title="Scar - Mastermind Single Card $2.50",
            snippet="Buy individual card from Winterspell set",
            url="https://example.com/singles/scar",
            product_type="booster_box",
            search_terms="Disney Lorcana Winterspell booster box display 24 pack",
        ))

    def test_singles_listing_rejected_for_booster_box(self):
        self.assertFalse(is_result_relevant(
            title="Winterspell Singles - Browse All Cards",
            snippet="Find singles from the Winterspell set",
            url="https://example.com/singles",
            product_type="booster_box",
            search_terms="Disney Lorcana Winterspell booster box",
        ))

    def test_product_page_url_accepted_without_keyword(self):
        """Direct product URLs should pass even without type keywords."""
        self.assertTrue(is_result_relevant(
            title="Winterspell - Great Deal",
            snippet="Buy now at a great price",
            url="https://example.com/product/winterspell-bb",
            product_type="booster_box",
            search_terms="Disney Lorcana Winterspell booster box",
        ))

    def test_unknown_type_always_relevant(self):
        self.assertTrue(is_result_relevant(
            title="Some random product",
            snippet="Whatever description",
            url="https://example.com/something",
            product_type="unknown",
            search_terms="something",
        ))

    def test_mixed_listing_with_positive_keyword_passes(self):
        """If both positive and negative keywords exist, keep the result."""
        self.assertTrue(is_result_relevant(
            title="Booster Box and Singles",
            snippet="Buy the booster box or browse singles",
            url="https://example.com/shop",
            product_type="booster_box",
            search_terms="Disney Lorcana booster box",
        ))

    def test_booster_box_result_rejected_for_single_card(self):
        self.assertFalse(is_result_relevant(
            title="Winterspell Sealed Booster Box",
            snippet="Buy the sealed booster box display",
            url="https://example.com/sealed",
            product_type="single_card",
            search_terms="Lorcana Scar Mastermind card",
        ))


class TestIsPriceReasonable(unittest.TestCase):

    def test_booster_box_normal_price(self):
        self.assertTrue(is_price_reasonable(110.00, 143.76, "booster_box"))

    def test_booster_box_single_card_price_rejected(self):
        self.assertFalse(is_price_reasonable(2.00, 143.76, "booster_box"))

    def test_booster_box_too_cheap(self):
        """Price below 30% of MSRP should be rejected."""
        self.assertFalse(is_price_reasonable(30.00, 143.76, "booster_box"))

    def test_booster_box_too_expensive(self):
        """Price above 2x MSRP should be rejected."""
        self.assertFalse(is_price_reasonable(300.00, 143.76, "booster_box"))

    def test_booster_box_hard_floor(self):
        """Even without MSRP, hard floor of $40 should apply."""
        self.assertFalse(is_price_reasonable(10.00, None, "booster_box"))
        self.assertTrue(is_price_reasonable(50.00, None, "booster_box"))

    def test_single_card_low_price(self):
        self.assertTrue(is_price_reasonable(0.50, None, "single_card"))

    def test_single_card_below_hard_floor(self):
        self.assertFalse(is_price_reasonable(0.10, None, "single_card"))

    def test_trove_normal_price(self):
        self.assertTrue(is_price_reasonable(38.00, 49.99, "trove"))

    def test_trove_too_cheap(self):
        self.assertFalse(is_price_reasonable(5.00, 49.99, "trove"))

    def test_unknown_type_permissive(self):
        """Unknown type should be permissive with $1 hard floor."""
        self.assertTrue(is_price_reasonable(5.00, None, "unknown"))
        self.assertFalse(is_price_reasonable(0.50, None, "unknown"))

    def test_boundary_at_msrp_floor(self):
        """Price at exactly 30% of MSRP should pass (not strictly less)."""
        msrp = 200.0
        # 60.0 == 200 * 0.30, should pass (not < floor, and > hard floor of $40)
        self.assertTrue(is_price_reasonable(60.0, msrp, "booster_box"))
        self.assertFalse(is_price_reasonable(59.99, msrp, "booster_box"))


if __name__ == "__main__":
    unittest.main()
