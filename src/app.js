import { darkChartDefaults, greenLineDataset, loadJson } from './lib/chartDefaults.js';

function withDarkChartDefaults(options = {}) {
    const scales = Object.entries(options.scales || {}).reduce((mergedScales, [scaleName, scaleOptions]) => {
        const defaultScale = darkChartDefaults.scales[scaleName] || darkChartDefaults.scales.y;

        return {
            ...mergedScales,
            [scaleName]: {
                ...defaultScale,
                ...scaleOptions,
                ticks: {
                    ...defaultScale.ticks,
                    ...scaleOptions.ticks
                },
                grid: {
                    ...defaultScale.grid,
                    ...scaleOptions.grid
                }
            }
        };
    }, darkChartDefaults.scales);

    return {
        ...darkChartDefaults,
        ...options,
        plugins: {
            ...darkChartDefaults.plugins,
            ...options.plugins,
            legend: {
                ...darkChartDefaults.plugins.legend,
                ...options.plugins?.legend,
                labels: {
                    ...darkChartDefaults.plugins.legend.labels,
                    ...options.plugins?.legend?.labels
                }
            }
        },
        scales
    };
}

function getChartContext(id) {
    return document.getElementById(id).getContext('2d');
}

async function loadChartData() {
    const monthly_metrics = await loadJson('./data/robinhood_metrics.json');
    const financials = await loadJson('./data/financials.json');
    const credit_card = await loadJson('./data/credit_card.json');

    const ctx1 = getChartContext('equities');
    const equity_assets = getChartContext('equityAssets');
    const crypto_assets = getChartContext('cryptoAssets');
    const op_fut_assets = getChartContext('optionsAssets');
    const auc_breakdown = getChartContext('aucBreakdown');
    const gold_subscribers = getChartContext('goldSubscribers');
    const gold_share = getChartContext('goldShare');
    const ctx2 = getChartContext('crypto');
    const ctx3 = getChartContext('options');
    const ctx4 = getChartContext('margin');
    const ctx5 = getChartContext('cashSweep');
    const ctx6 = getChartContext('platformAssets');
    const ctx7 = getChartContext('netDeposits');
    const ctx8 = getChartContext('fundedCustomers');
    const ctxVelocity = getChartContext('velocityChart');
    const revenue = getChartContext('revenueChart');
    const credit_card_provisions = getChartContext('creditCardProvisions');
    const credit_card_bs = getChartContext('creditCardBalanceSheet');
    const credit_card_bs_percentage = getChartContext('creditCardBalanceSheetPercentage');
    const cc_fico = getChartContext('creditCardFICO');

    const verticalLinePlugin = {
        getLinePosition: function (chart, pointIndex) {
            const meta = chart.getDatasetMeta(0); // First dataset is used to discover X coordinate of a point
            const data = meta.data;
            return data[pointIndex].x;
        },

        renderVerticalLine: function (chartInstance, description) {
            const { index: pointIndex, text } = description; // Destructure index and text
            const lineLeftOffset = this.getLinePosition(chartInstance, pointIndex);
            const scale = chartInstance.scales.y;
            const context = chartInstance.ctx;

            // Render vertical line
            context.beginPath();
            context.strokeStyle = '#348a37';
            context.moveTo(lineLeftOffset, scale.top);
            context.lineTo(lineLeftOffset, scale.bottom);
            context.stroke();

            // Write label
            context.fillStyle = "#348a37";
            context.textAlign = 'center';
            context.fillText(text, lineLeftOffset, (scale.bottom - scale.top) / 2 + scale.top);
        },

        beforeDatasetsDraw: function (chart, easing) {
            if (chart.config.options.plugins.descriptions) {
                chart.config.options.plugins.descriptions.forEach(description => {
                    this.renderVerticalLine(chart, description);
                });
            }
        }
    };

    // Equities Chart
    new Chart(ctx1, {
        type: 'line',
        data: {
            labels: monthly_metrics.map(row => row.Month), 
            datasets: [
                greenLineDataset(
                    'Equity Volumes ($B)', 
                    monthly_metrics.map(row => row.Equities)
                )
            ]
        },
        options: withDarkChartDefaults()
    });
    //equity assets chart
    new Chart(equity_assets, {
        type: 'line',
        data: {
            labels: financials[0].Financials.map(row => row.Quarter), 
            datasets: [
                greenLineDataset(
                    'Equity Assets ($B)',
                    financials[0].Financials.map(row => row.Equities)
                )
            ]
        },
        options: withDarkChartDefaults()
    });
    // Crypto Asset Chart
    new Chart(crypto_assets, {
        type: 'line',
        data: {
            labels: financials[0].Financials.map(row => row.Quarter), 
            datasets: [
                greenLineDataset(
                    'Crypto Assets ($B)',
                    financials[0].Financials.map(row => row.Cryptocurrencies)
                )
            ]
        },
        options: withDarkChartDefaults()
    });

    new Chart(op_fut_assets, {
        type: 'line',
        data: {
            labels: financials[0].Financials.map(row => row.Quarter), 
            datasets: [
                greenLineDataset(
                    'Options & Futures Assets ($B)',
                    financials[0].Financials.map(row => row.OptionsFutures)
                )
            ]
        },
        options: withDarkChartDefaults()
    });

    new Chart(ctx2, {
        type: 'line',
        data: {
            labels: monthly_metrics.map(row => row.Month), 
            datasets: [
                greenLineDataset(
                    'Crypto Volumes ($B)',
                    monthly_metrics.map(row => row.Crypto)
                )
            ]
        },
        options: withDarkChartDefaults()
    });

    new Chart(ctx3, {
        type: 'line',
        data: {
            labels: monthly_metrics.map(row => row.Month), 
            
            datasets: [
                greenLineDataset(
                    'Option Volumes ($M)',
                    monthly_metrics.map(row => row.Options)
                )
            ]
        },
        options: withDarkChartDefaults()
    });

    new Chart(ctx4, {
    type: 'line',
    data: {
        labels: monthly_metrics.map(row => row.Month),
        datasets: [
            greenLineDataset(
                'Margin Book ($B)',
                monthly_metrics.map(row => row.Margin)
            )
        ]
    },
    options: withDarkChartDefaults({
        plugins: {
            descriptions: [
                { index: 16, text: '' },
                { index: 38, text: '' }
            ]
        }
    }),
    plugins: [verticalLinePlugin]
});

    new Chart(ctx5, {
        type: 'line',
        data: {
            labels: monthly_metrics.map(row => row.Month), 
            datasets: [
                greenLineDataset(
                    'Cash Sweep ($B)',
                    monthly_metrics.map(row => row.CashSweep)
                )
            ]
        },
        options: withDarkChartDefaults({
            plugins: {
                descriptions: [
                    { index: 38, text: '' }
                ]
            }
        }),
        plugins: [verticalLinePlugin]
    });

    new Chart(ctx6, {
        type: 'line',
        data: {
            labels: monthly_metrics.map(row => row.Month), 
            datasets: [
                greenLineDataset(
                    'Platform Assets ($B)',
                    monthly_metrics.map(row => row.PlatformAssets)
                )
            ]
        },
        options: withDarkChartDefaults()
    });
    new Chart(ctx7, {
        type: 'line',
        data: {
            labels: monthly_metrics.map(row => row.Month), 
            datasets: [
                greenLineDataset(
                    'Net Deposits ($B)',
                    monthly_metrics.map(row => row.NetDeposits)
                )
            ]
        },
        options: withDarkChartDefaults()
    });

    new Chart(ctx8, {
        type: 'line',
        data: {
            labels: monthly_metrics.map(row => row.Month), 
            datasets: [
                greenLineDataset(
                    'Funded Customers (M)',
                    monthly_metrics.map(row => row.FundedCustomers)
                )
            ]
        },
        options: withDarkChartDefaults({
            scales: {
                y: {
                    beginAtZero: false,
                    min: Math.min(...monthly_metrics.map(row => row.FundedCustomers)) * .95
                }
            }
        })
    });

    new Chart(ctxVelocity, {
            type: 'bar',
            data: {
                labels: monthly_metrics.map(row => row.Month),
                datasets: [
                    {
                        label: 'Net New Deposits ($B)',
                        data: monthly_metrics.map(row => row.NetDeposits),
                        backgroundColor: 'rgba(0, 200, 5, 0.3)',
                        borderColor: 'rgb(0, 200, 5)',
                        borderWidth: 1,
                        yAxisID: 'yRight',
                        order: 3
                    },
                    {
                        label: '1% Deposit Baseline ($B)',
                        data: monthly_metrics.map(row => row.PlatformAssets *.01),
                        type: 'line',
                        borderColor: 'rgba(255, 159, 64, 0.8)',
                        borderWidth: 2,
                        borderDash: [5, 5],
                        fill: false,
                        pointRadius: 0,
                        yAxisID: 'yRight',
                        order: 2
                    },
                    {
                        label: 'Total Platform Assets ($B)',
                        data: monthly_metrics.map(row => row.PlatformAssets),
                        type: 'line',
                        borderColor: '#1f77b4',
                        borderWidth: 3,
                        backgroundColor: 'transparent',
                        yAxisID: 'yLeft',
                        order: 1
                    }
                ]
            },
            options: withDarkChartDefaults({
                plugins: { legend: { display: true } },
                scales: {
                    yLeft: {
                        type: 'linear',
                        position: 'left',
                        title: { display: true, text: 'Platform Assets ($B)' },
                        min: 40,
                        max: 400
                    },
                    yRight: {
                        type: 'linear',
                        position: 'right',
                        title: { display: true, text: 'Deposits / Baseline ($B)' },
                        min: 0,
                        max: 10,
                        grid: { drawOnChartArea: false } // Hides duplicate gridlines
                    },
                    x: {
                        grid: { display: false }
                    }
                }
            })
    });

    new Chart(auc_breakdown, {
        type: 'bar',
        data: {
            labels: financials[0].Financials.map(row => row.Quarter),
            datasets: Object.keys(financials[0].Financials[0]) // retrieve all keys from the first object in the financials json
                .filter(key => key !== 'Quarter' && key !== 'TotalPlatform' && key !== 'AcquiredAssets')
                .map((key, index) => ({
                    label: key,
                    data: financials[0].Financials.map(row => row[key]),
                    borderColor: `hsl(${index * 50}, 85%, 35%)`, // Wider range of hues for borders
                    backgroundColor: `hsla(${index * 50}, 70%, 50%, 0.7)`,
                    fill: true,
                    tension: 0.3
                }))
        },
        options: withDarkChartDefaults({
            plugins: {
                legend: { display: true }
            },
            scales: {
                x: {
                    stacked: true,
                    title: { display: true, text: 'Quarters' } },
                y: {
                    stacked: true,
                    title: { display: true, text: 'Percentage Contribution (%)' },
                    min: 0,
                    max: 400
                }
            }
        })
    });
    new Chart(credit_card_bs, {
        type: 'bar',
        data: {
            labels: credit_card.map(row => row.Quarter),
            datasets: [
                {
                    label: 'Current',
                    data: credit_card.map(row => row.Current_ON_BS + row.Current_OFF_BS), 
                    borderColor: 'hsl(220, 85%, 45%)', 
                    backgroundColor: 'hsla(220, 85%, 45%, 0.7)'
                },
                {
                    label: 'LT 90 Days',
                    data: credit_card.map(row => row.LT_90_Days_ON_BS + row.LT_90_Days_OFF_BS), 
                    borderColor: 'hsl(120, 65%, 40%)', 
                    backgroundColor: 'hsla(120, 65%, 40%, 0.7)'
                },
                {
                    label: 'GT 90 Days',
                    data: credit_card.map(row => row.GT_90_Days_ON_BS + row.GT_90_Days_OFF_BS), 
                    borderColor: 'hsl(0, 85%, 45%)', 
                    backgroundColor: 'hsla(0, 85%, 45%, 0.7)'
                }
            ]
        },
        options: withDarkChartDefaults({
            plugins: {
                legend: { display: true }
            },
            scales: {
                x: {
                    stacked: true,
                    title: { display: true, text: 'Quarters' } },
                y: {
                    stacked: true,
                    title: { display: true, text: 'Credit Card Balance Sheet ($M)' },
                    min: 0
                }
            }
        })
    });

    new Chart(credit_card_bs_percentage, {
        type: 'bar',
        data: {
            labels: credit_card.map(row => row.Quarter),
            datasets: [
                {
                    label: 'Current',
                    data: credit_card.map(row => 
                        ((row.Current_ON_BS + row.Current_OFF_BS) / 
                        ((row.Current_ON_BS + row.Current_OFF_BS) + 
                        (row.LT_90_Days_ON_BS + row.LT_90_Days_OFF_BS) + 
                        (row.GT_90_Days_ON_BS + row.GT_90_Days_OFF_BS)))*100
                    ),
                    borderColor: 'hsl(220, 85%, 45%)',
                    backgroundColor: 'hsla(220, 85%, 45%, 0.7)'
                },
                {
                    label: 'LT 90 Days',
                    data: credit_card.map(row => 
                        ((row.LT_90_Days_ON_BS + row.LT_90_Days_OFF_BS) / 
                        ((row.Current_ON_BS + row.Current_OFF_BS) + 
                        (row.LT_90_Days_ON_BS + row.LT_90_Days_OFF_BS) + 
                        (row.GT_90_Days_ON_BS + row.GT_90_Days_OFF_BS)))*100
                    ),
                    borderColor: 'hsl(120, 65%, 40%)',
                    backgroundColor: 'hsla(120, 65%, 40%, 0.7)'
                },
                {
                    label: 'GT 90 Days',
                    data: credit_card.map(row => 
                        ((row.GT_90_Days_ON_BS + row.GT_90_Days_OFF_BS) / 
                        ((row.Current_ON_BS + row.Current_OFF_BS) + 
                        (row.LT_90_Days_ON_BS + row.LT_90_Days_OFF_BS) + 
                        (row.GT_90_Days_ON_BS + row.GT_90_Days_OFF_BS)))*100
                    ),
                    borderColor: 'hsl(0, 85%, 45%)',
                    backgroundColor: 'hsla(0, 85%, 45%, 0.7)'
                }
            ]
        },
        options: withDarkChartDefaults({
            plugins: {
                legend: { display: true }
            },
            scales: {
                x: {
                    stacked: true,
                    title: { display: true, text: 'Quarters' } },
                y: {
                    stacked: true,
                    title: { display: true, text: 'Credit Card Balance Sheet ($M)' },
                    min: 0
                }
            }
        })
    });

    new Chart(cc_fico, {
        type: 'bar',
        data: {
            labels: credit_card.map(row => row.Quarter),
            datasets: [
                {
                    label: 'FICO < 640',
                    data: credit_card.map(row => row.FICO['LT_640']), 
                    borderColor: 'hsl(0, 85%, 45%)', 
                    backgroundColor: 'hsla(0, 85%, 45%, 0.7)'
                },
                {
                    label: 'FICO 640-699',
                    data: credit_card.map(row => row.FICO['640_679']), 
                    borderColor: 'hsl(30, 85%, 45%)', 
                    backgroundColor: 'hsla(30, 85%, 45%, 0.7)'
                },
                {
                    label: 'FICO > 690',
                    data: credit_card.map(row => row.FICO['GT_690']), 
                    borderColor: 'hsl(60, 85%, 45%)', 
                    backgroundColor: 'hsla(60, 85%, 45%, 0.7)'
                },
            ]
        },
        options: withDarkChartDefaults({
            plugins: {
                legend: { display: true }
            },
            scales: {
                x: {
                    stacked: true,
                    title: { display: true, text: 'Quarters' } },
                y: {
                    stacked: true,
                    title: { display: true, text: 'Credit Card FICO Distribution' },
                    min: 0
                }
            }
        })
    });

    const companyData = financials.find(company => company.Company === 'Robinhood');
    const filteredFinancials = companyData.Financials.slice(
        companyData.Financials.findIndex(row => row.Quarter === 'Q321')
    );
    new Chart(revenue, {
        type: 'bar',
        data: {
            labels: filteredFinancials.map(row => row.Quarter),
            datasets: Object.keys(filteredFinancials[0])
            .filter(key => key === 'Revenue' || key === 'NetIncome')
            .map((key, index) => ({
                    label: key,
                    data: filteredFinancials.map(row => row[key]),
                    borderColor: key === 'Revenue' ? 'hsl(220, 85%, 45%)' : 'hsl(120, 65%, 40%)',
                    backgroundColor: filteredFinancials.map(row => 
                    row[key] < 0 ? 'rgba(255, 0, 0, 0.7)' : 
                    (key === 'Revenue' ? 'hsla(220, 85%, 45%, 0.7)' : 'hsla(120, 65%, 40%, 0.7)') 
                ),
                    fill: true,
                    tension: 0.3
                }))
        },
        options: withDarkChartDefaults({
            plugins: {
                legend: { display: true }
            },
            scales: {
                x: {
                    stacked: true,
                    title: { display: true, text: 'Quarters' } },
                y: {
                    stacked: true,
                    title: { display: true, text: 'Revenue / Net Income ($M)' },
                    min: -1900
                }
            }
        })
    });

    new Chart(gold_subscribers, {
        type: 'line',
        data: {
        labels: financials[0].Financials
            .slice(financials[0].Financials.findIndex(row => row.Quarter === 'Q322'))
            .map(row => row.Quarter),
            datasets: [
                greenLineDataset(
                    'Gold Subscribers (M)',
                    financials[0].Financials
                    .slice(financials[0].Financials.findIndex(row => row.Quarter === 'Q322'))
                    .map(row => row.Gold || 0)
                )
            ]
        },
        options: withDarkChartDefaults({
        scales: {
            y: {
                beginAtZero: false
            }
        },
        plugins: {
            descriptions: [
                { index: 6, text: '' }, // gold credit card + ira match
                { index: 14, text: '' }, // platinum credit cards
                { index: 13, text: '' }, // sage mortgage loans
                { index: 10, text: '' }  // AI Insights + Robinhood strategies
            ]
        }
        }),
        plugins: [verticalLinePlugin]
    });

    new Chart(gold_share, {
        type: 'line',
        data: {
            labels: financials[0].Financials
                .slice(financials[0].Financials.findIndex(row => row.Quarter === 'Q322'))
                .map(row => row.Quarter),
            datasets: [
                greenLineDataset(
                    'Gold Share of Total Customers (%)',
                    financials[0].Financials
                    .slice(financials[0].Financials.findIndex(row => row.Quarter === 'Q322'))
                    .map(row => (row.Gold / row.TotalCustomers) * 100)
                )
            ]
        },
        options: withDarkChartDefaults({
            scales: {
                y: {
                    beginAtZero: false,
                    min: 0,
                    max: 20
                }
            }
        })
    });

    const creditCardFinancials = financials[0].Financials.slice(
        financials[0].Financials.findIndex(row => row.Quarter === 'Q423')
    );

    new Chart(credit_card_provisions, {
        type: 'bar',
        data: {
            labels: creditCardFinancials.map(row => row.Quarter),
            datasets: [
                {
                    label: 'Credit Card Provisions ($M)',
                    data: creditCardFinancials.map(row => row.ProvisionForCreditCardLosses),
                    borderColor: '#00C805',
                    backgroundColor: 'rgba(0, 200, 5)',
                    fill: false,
                    tension: 0.3
                },
                {
                    label: 'Write-offs ($M)',
                    data: creditCardFinancials.map(row => row.CreditCardWriteOffs),
                    borderColor: '#FF0000',
                    backgroundColor: 'rgba(255, 0, 0)',
                    fill: false,
                    tension: 0.3
                }
        ]
        },
        options: withDarkChartDefaults()
    })
}

loadChartData();

    // Banking Chart: Tracking Membership vs Total Customers
    const ctxBanking = getChartContext('bankingChart');
    new Chart(ctxBanking, {
        type: 'bar',
        data: {
            labels: ['4/25', '9/25', '2/26', '3/26', '7/26'],
            datasets: [{
                label: 'Robinhood Strategies AUM',
                data: [100, 1000, 1300, 1600, 1900],
                borderColor: '#00C805',
                tension: 0.3,
                fill: true,
                backgroundColor: 'rgba(0, 200, 5)'
            }]
        },
        options: withDarkChartDefaults({
            plugins: { legend: { display: false } },
            scales: {
                y: { grid: { color: '#333' } },
                x: { grid: { display: false } }
            }
        })
    });
    const ctxBankingAUM = getChartContext('bankingAUM');
    new Chart(ctxBankingAUM, {
        type: 'bar',
        data: {
            labels: ['12/25','1/26','2/26','3/26','4/26','4/26','6/26', '7/26', '8/26'],
            datasets: [{
                label: 'Robinhood Banking AUM',
                data: [100, 300, 400, 1000, 1500, 2000, 2500, 3100, 4000],
                borderColor: '#00C805',
                tension: 0.3,
                fill: true,
                backgroundColor: 'rgba(0, 200, 5)'
            }]
        },
        options: withDarkChartDefaults({
            plugins: { legend: { display: false } },
            scales: {
                y: { grid: { color: '#333' } },
                x: { grid: { display: false } }
            }
        })
    });
    // 2. International Growth: Comparing M/M % Change
    const ctxGrowth = getChartContext('growthChart');
    new Chart(ctxGrowth, {
        type: 'bar',
        data: {
            labels: ['4/25', '9/25', '2/26', '4/26', '6/26'], 
            datasets: [{
                label: 'EU/UK M/M % Change',
                data: [150, 750, 750, 1000, 1100],
                backgroundColor: '#00C805',
                borderRadius: 5
            }]
        },
        options: withDarkChartDefaults({
            plugins: { legend: { display: false } },
            scales: {
                y: { grid: { color: '#333' }, beginAtZero: true },
                x: { grid: { display: false } }
            }
        })
    });
