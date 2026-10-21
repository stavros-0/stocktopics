# Stock Topics

Homepage and static Chart.js dashboards for Robinhood, Starbucks, and Nike. Choose a company from the homepage or top navigation to explore its metrics.

## Local Use

Run a local static server:

```bash
python3 -m http.server 8000
```

Then open:

```text
http://localhost:8000
```

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
