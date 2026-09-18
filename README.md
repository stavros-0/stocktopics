# Robinhood Analytics Dashboard

Static Chart.js dashboard for Robinhood operating, financial, customer, platform asset, revenue, and credit card metrics.

## Local Use

Run a local static server:

```bash
python3 -m http.server 8000
```

Then open:

```text
http://localhost:8000
```

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
