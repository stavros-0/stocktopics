# Stock Topics

Homepage and static Chart.js dashboards for Robinhood, Starbucks, Nike, and Meta. Choose a company from the homepage or top navigation to explore its metrics. Meta's Financials view covers Q1 2021 through Q3 2026. The 2021–2024 revenue, net income, shares and EPS rows come from Meta's quarterly earnings releases (linked by quarter in `data/meta.json`); R&D and 2025–2026 financials come from the Financials sheet of `META.ods`. Q4 2021–2024 R&D is the workbook's full-year amount less Q1–Q3. R&D charts show quarterly expense and its percentage and dollar changes from the prior quarter. Meta's Cash view covers Q1 2020 through Q3 2026, with all values copied from the workbook's Cash sheet. Side-by-side construction in progress bar charts show the quarterly change and full quarter-end balance. The change is not a measure of cash spent on construction. Paired depreciation and amortization charts show each quarterly amount and its change from the prior quarter.

## Starbucks Cost Changes

Starbucks' product and distribution costs rose from 30.9% of revenue in fiscal 2024 to 31.4% in 2025 and 32.3% in 2026. The `SGA` field in `data/financials.json` combines store operating expenses, other operating expenses, depreciation and amortization, and general and administrative expenses; it rose from 55.0% of revenue in 2024 to 59.0% in 2025, then fell to 57.0% in 2026. Restructuring and impairments added 2.4% of revenue in 2025 and 1.8% in 2026, versus essentially zero in 2024. Starbucks attributed the 2025 cost pressure to store closures, labor investments, inflation, and sales that did not keep pace with costs. [FY2025 results](https://investor.starbucks.com/news/financial-releases/news-details/2025/Starbucks-Reports-Q4-and-Full-Fiscal-Year-2025-Results/default.aspx) · [FY2026 results](https://investor.starbucks.com/news/financial-releases/news-details/2026/Starbucks-Reports-Q4-and-Full-Fiscal-Year-2026-Results/default.aspx)

## Rothera Daily Data

`data/rothera_history.json` starts with the October 20, 2026 clearing file. `data/rothera_snapshot.json` is the latest day shown on the site. Volume is a contract count, not a dollar value; topics are inferred from product-code prefixes.

The GitHub Pages workflow in `.github/workflows/static.yml` checks for new [Rothera clearing files](https://publicfiles.rotheramarkets.com/) at 10:17 AM New York time each day, updates both JSON files, commits any changes, and deploys the site. It also runs from the Actions tab or on pushes to `main`. A missing daily file is retried on the next run.

To add a downloaded file manually:

```bash
python3 scripts/update_rothera_history.py --csv /path/to/mkt_eod_YYYYMMDD.csv
```

To backfill earlier dates, run `python3 scripts/update_rothera_history.py --start-date YYYY-MM-DD`. The dashboard currently shows the latest day; the history is available for future monthly, six-month, and YTD views.

## Robinhood Chain

The Robinhood Chain topic shows daily mainnet transactions, active addresses, total value secured, chain revenue, L1 costs, and estimated chain profit. It fetches the public [growthepie chain series](https://www.growthepie.com/chains/robinhood) in the browser, so no API key or scheduled data commit is needed. The economics section also shows 7-day, 30-day, and since-launch totals calculated over dates with all three USD series available. Charts offer 30-day, 90-day, and full-history views. Each daily summary card displays its own latest available UTC date because source metrics can update at different times. Active addresses are distinct addresses, not people; total value secured is not DeFi protocol TVL. Estimated chain profit subtracts L1 costs from chain revenue and does not represent Robinhood's retained share or company net income.

## Robinhood Stock Price in Transaction Charts

The stock price line in both transaction revenue charts uses the average of each month's high and low, then averages those monthly values within each quarter or year. The monthly metrics file supplies prices from December 2022 through May 2026. [Yahoo Finance historical prices](https://finance.yahoo.com/quote/HOOD/history/) supply the missing traded months in `data/robinhood_stock_prices.json`. HOOD began trading on July 29, 2021, so earlier financial quarters have no stock price.

## Revenue Per Funded Customer vs Robinhood ARPU

The dashboard's revenue per funded customer chart currently calculates quarterly revenue per ending funded customer:

```js
Revenue / TotalCustomers * 1000
```

Robinhood's reported ARPU is different. Robinhood defines ARPU as total revenue divided by the average number of funded customers at the end of the current period and the end of the immediately preceding period. For quarterly periods, Robinhood reports ARPU annualized.

That means Robinhood's reported quarterly ARPU is closer to:

```js
Revenue / averageFundedCustomers * 1000 * 4
```

So the dashboard's revenue per funded customer will usually be much lower than Robinhood's reported ARPU because it is not annualized and uses ending customers instead of average customers.

## Gold Subscriber Milestones

Use these milestones for the vertical line annotations on the Gold subscriber chart.

| Milestone | Date | Source |
| --- | --- | --- |
| 1k free margin | April 2019 | [CNBC](https://www.cnbc.com/2019/04/11/ahead-of-ipo-buzz-robinhood-introduces-new-premium-trading-features.html) |
| Morningstar research | April 10, 2019 | [Robinhood Newsroom](https://robinhood.com/us/en/newsroom/a-new-gold-experience/) |
| IRA Match | February 1, 2024 | [InvestmentNews](https://www.investmentnews.com/retirement-planning/robinhood-is-paying-3-percent-bonuses-for-ira-rollovers-is-it-enough/248810) |
| Credit Card Gold | March 27, 2024 | [Robinhood Newsroom](https://www.robinhood.com/us/en/newsroom/the-new-gold-standard-introducing-the-robinhood-gold-card) |
| AI Insights | March 27, 2025 | [neobanque.ch](https://neobanque.ch/blog/robinhood-strategies-banking-cortex-gold-event-2025/) |
| Robinhood Strategies | March 27, 2025 | [neobanque.ch](https://neobanque.ch/blog/robinhood-strategies-banking-cortex-gold-event-2025/) |
| Mortgage loans | November 3, 2025 | [Robinhood Newsroom](https://robinhood.com/us/en/newsroom/robinhood-sage-home-loans/) |
| Platinum credit card | March 4, 2026 | [Robinhood Newsroom](https://robinhood.com/us/en/newsroom/robinhood-unveils-the-future-of-family-finance-at-robinhood-presents-take-flight/) |
| High yield on cash switch | TBD | TBD |
| Options | TBD | TBD |
