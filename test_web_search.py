#!/usr/bin/env python3
"""
Standalone test: run this on your local machine to verify
Google search works for Lorcana Wilds Unknown preorder prices.

Usage:
    python test_web_search.py
"""

from tracker.web_search import search_web_prices, _build_queries

SEARCH_TERMS = "Disney Lorcana Wilds Unknown booster box preorder"
MSRP = 143.76
TARGET = 110.00

print("=" * 60)
print("Lorcana Wilds Unknown — Web Search Price Test")
print("=" * 60)
print()

# Show what queries will be run
queries = _build_queries(SEARCH_TERMS, 2026, MSRP, TARGET)
print("Search queries:")
for i, q in enumerate(queries, 1):
    print(f"  {i}. {q}")
print()

# Run the actual search
print("Searching...")
print()
results = search_web_prices(
    search_terms=SEARCH_TERMS,
    msrp=MSRP,
    target_price=TARGET,
    max_results=5,
)

if not results:
    print("No prices found via web search.")
    print("This may mean:")
    print("  - Google is blocking requests (try again later)")
    print("  - No prices appear in search snippets for this product")
    print("  - The search terms need adjustment")
else:
    print(f"Found {len(results)} prices:")
    print()
    for r in results:
        print(f"  ${r.price:.2f} — {r.source}")
        print(f"    URL: {r.url}")
        if r.snippet:
            print(f"    Snippet: {r.snippet[:120]}")
        print()
