import { chartColor, chartColors, darkChartDefaults, greenLineDataset, loadJson } from './lib/chartDefaults.js';

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

const periodChartIds = new Set([
    'equityAssets',
    'cryptoAssets',
    'optionsAssets',
    'aucBreakdown',
    'revenueChart',
    'transactionRevenueBreakdown',
    'transactionRevenueMixPercentage',
    'revenueMix',
    'starbucksRevenueBreakdown',
    'revenueMixPercentage',
    'revenuePlatformAssets',
    'revenuePerCustomer',
    'platformAssetsPerCustomer',
    'goldSubscribers',
    'goldShare',
    'creditCardProvisions'
]);

const chartPeriods = {};
let activeRenderChartId = null;
let cachedDashboardData = null;
let dynamicCharts = [];
const chartInstances = {};
let selectedCompany = 'Robinhood';

function createChart(context, config) {
    const chartId = context.canvas.id;

    if (activeRenderChartId && chartId !== activeRenderChartId) {
        return null;
    }

    if (context.canvas.closest('.is-hidden')) {
        return null;
    }

    if (chartInstances[chartId]) {
        const existingChart = chartInstances[chartId];
        dynamicCharts = dynamicCharts.filter(chart => chart !== existingChart);
        existingChart.destroy();
    }

    const chart = new Chart(context, config);
    chartInstances[chartId] = chart;
    dynamicCharts.push(chart);
    return chart;
}

function clearDynamicCharts() {
    dynamicCharts.forEach(chart => chart.destroy());
    dynamicCharts = [];
    Object.keys(chartInstances).forEach(chartId => {
        delete chartInstances[chartId];
    });
}

function clearChart(chartId) {
    const chart = chartInstances[chartId];

    if (chart) {
        dynamicCharts = dynamicCharts.filter(dynamicChart => dynamicChart !== chart);
        chart.destroy();
    }

    delete chartInstances[chartId];
}

async function getDashboardData() {
    if (!cachedDashboardData) {
        cachedDashboardData = {
            monthly_metrics: await loadJson('./data/robinhood_metrics.json'),
            financials: await loadJson('./data/financials.json'),
            credit_card: await loadJson('./data/credit_card.json')
        };
    }

    return cachedDashboardData;
}

function yearFromQuarter(quarter) {
    return `20${quarter.slice(2)}`;
}

function toAnnualFinancials(rows) {
    const endingPeriodFields = new Set([
        'Equities',
        'Cryptocurrencies',
        'OptionsFutures',
        'RIAAssets',
        'CustomerCash',
        'CustomerReceivables',
        'TotalPlatform',
        'AcquiredAssets',
        'TotalCustomers',
        'Gold',
        'AverageClientBalance',
        'AUC',
        'Cash',
        'Debt',
        'Assets',
        'MarketCap',
        'EnterpriseValue',
        'Shares',
        'EPS',
        'Price',
        'GrossMarginRate',
        'GrossMarginRateQoQ',
        'GrossMarginRateYoY',
        'OperatingMarginRate',
        'OperatingMarginRateQoQ',
        'OperatingMarginRateYoY',
        'NetIncomeGrowthQoQ',
        'NetIncomeGrowthYoY',
        'TaxRate',
        'PEIncludingRestructuring'
    ]);

    const rowsByYear = rows.reduce((groups, row) => {
        const year = yearFromQuarter(row.Quarter);
        groups[year] = groups[year] || [];
        groups[year].push(row);
        return groups;
    }, {});

    return Object.entries(rowsByYear).map(([year, yearRows]) => {
        const annualRow = { Quarter: year };
        const lastRow = yearRows[yearRows.length - 1];
        const keys = [...new Set(yearRows.flatMap(row => Object.keys(row)))].filter(key => key !== 'Quarter');

        keys.forEach(key => {
            if (endingPeriodFields.has(key)) {
                if (lastRow[key] !== undefined) {
                    annualRow[key] = lastRow[key];
                }
                return;
            }

            const values = yearRows
                .map(row => row[key])
                .filter(value => typeof value === 'number');

            if (values.length) {
                annualRow[key] = values.reduce((sum, value) => sum + value, 0);
            }
        });

        return annualRow;
    });
}

function getChartPeriod(chartId) {
    return chartPeriods[chartId] || 'quarterly';
}

function getFinancialRowsForChart(chartId, rows) {
    return getChartPeriod(chartId) === 'annual' ? toAnnualFinancials(rows) : rows;
}

function filteredFinancialRowsForChart(chartId, rows, quarterlyStart, annualStart) {
    const chartRows = getFinancialRowsForChart(chartId, rows);
    const startQuarter = getChartPeriod(chartId) === 'annual' ? annualStart : quarterlyStart;
    const startIndex = chartRows.findIndex(row => row.Quarter === startQuarter);
    return chartRows.slice(startIndex === -1 ? 0 : startIndex);
}

function setupChartPeriodControls() {
    periodChartIds.forEach(chartId => {
        const canvas = document.getElementById(chartId);
        const card = canvas?.closest('.card');

        if (!card || card.classList.contains('is-hidden')) {
            card?.querySelector(`[data-period-chart="${chartId}"]`)?.remove();
            return;
        }

        if (card.querySelector(`[data-period-chart="${chartId}"]`)) {
            return;
        }

        const toggle = document.createElement('div');
        toggle.className = 'period-toggle';
        toggle.dataset.periodChart = chartId;
        toggle.setAttribute('aria-label', `${chartId} period`);
        toggle.innerHTML = `
            <button type="button" class="period-toggle__button is-active" data-chart-period="quarterly">Quarterly</button>
            <button type="button" class="period-toggle__button" data-chart-period="annual">Annual</button>
        `;
        canvas.before(toggle);

        toggle.addEventListener('click', event => {
            const button = event.target.closest('[data-chart-period]');

            if (!button) {
                return;
            }

            chartPeriods[chartId] = button.dataset.chartPeriod;
            toggle.querySelectorAll('[data-chart-period]').forEach(periodButton => {
                periodButton.classList.toggle('is-active', periodButton === button);
            });
            loadChartData(chartId);
        });
    });
}

function updateCompanyVisibility() {
    document.querySelector('header h1').textContent = `${selectedCompany} Analytics`;
    document.querySelector('header p').textContent = selectedCompany === 'Robinhood'
        ? 'Focus: Banking & International Expansion'
        : 'Focus: Revenue, margins, and operating trends';

    document.querySelectorAll('[data-company-only]').forEach(element => {
        element.classList.toggle('is-hidden', element.dataset.companyOnly !== selectedCompany);
    });
}

function setupCompanyTabs() {
    document.querySelectorAll('[data-company]').forEach(button => {
        button.addEventListener('click', () => {
            selectedCompany = button.dataset.company;
            document.querySelectorAll('[data-company]').forEach(companyButton => {
                companyButton.classList.toggle('is-active', companyButton === button);
            });
            updateCompanyVisibility();
            setupChartPeriodControls();
            loadChartData();
        });
    });
}

async function loadChartData(chartId = null) {
    activeRenderChartId = chartId;

    if (!chartId) {
        clearDynamicCharts();
    }

    const { monthly_metrics, financials, credit_card } = await getDashboardData();
    const companyData = financials.find(company => company.Company === selectedCompany);
    const companyBaseFinancials = companyData.Financials;
    const isRobinhood = selectedCompany === 'Robinhood';

    const ctxBanking = getChartContext('bankingChart');
    const ctxBankingAUM = getChartContext('bankingAUM');
    const ctxGrowth = getChartContext('growthChart');
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
    const transaction_revenue_breakdown = getChartContext('transactionRevenueBreakdown');
    const transaction_revenue_mix_percentage = getChartContext('transactionRevenueMixPercentage');
    const revenue_mix = getChartContext('revenueMix');
    const starbucks_revenue_breakdown = getChartContext('starbucksRevenueBreakdown');
    const revenue_mix_percentage = getChartContext('revenueMixPercentage');
    const revenue_platform_assets = getChartContext('revenuePlatformAssets');
    const revenue_per_customer = getChartContext('revenuePerCustomer');
    const platform_assets_per_customer = getChartContext('platformAssetsPerCustomer');
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
    createChart(ctx1, {
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
    const equityAssetsFinancials = getFinancialRowsForChart('equityAssets', companyBaseFinancials);
    createChart(equity_assets, {
        type: 'line',
        data: {
            labels: equityAssetsFinancials.map(row => row.Quarter), 
            datasets: [
                greenLineDataset(
                    'Equity Assets ($B)',
                    equityAssetsFinancials.map(row => row.Equities)
                )
            ]
        },
        options: withDarkChartDefaults()
    });
    // Crypto Asset Chart
    const cryptoAssetsFinancials = getFinancialRowsForChart('cryptoAssets', companyBaseFinancials);
    createChart(crypto_assets, {
        type: 'line',
        data: {
            labels: cryptoAssetsFinancials.map(row => row.Quarter), 
            datasets: [
                greenLineDataset(
                    'Crypto Assets ($B)',
                    cryptoAssetsFinancials.map(row => row.Cryptocurrencies)
                )
            ]
        },
        options: withDarkChartDefaults()
    });

    const optionsAssetsFinancials = getFinancialRowsForChart('optionsAssets', companyBaseFinancials);
    createChart(op_fut_assets, {
        type: 'line',
        data: {
            labels: optionsAssetsFinancials.map(row => row.Quarter), 
            datasets: [
                greenLineDataset(
                    'Options & Futures Assets ($B)',
                    optionsAssetsFinancials.map(row => row.OptionsFutures)
                )
            ]
        },
        options: withDarkChartDefaults()
    });

    createChart(ctx2, {
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

    createChart(ctx3, {
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

    createChart(ctx4, {
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

    createChart(ctx5, {
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

    createChart(ctx6, {
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
    createChart(ctx7, {
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

    createChart(ctx8, {
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

    createChart(ctxVelocity, {
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

    const aucBreakdownKeys = [
        'Equities',
        'Cryptocurrencies',
        'OptionsFutures',
        'RIAAssets',
        'CustomerCash'
    ];
    const aucBreakdownFinancials = getFinancialRowsForChart('aucBreakdown', companyBaseFinancials);

    createChart(auc_breakdown, {
        type: 'bar',
        data: {
            labels: aucBreakdownFinancials.map(row => row.Quarter),
            datasets: aucBreakdownKeys.map((key, index) => ({
                    label: key,
                    data: aucBreakdownFinancials.map(row => row[key]),
                    borderColor: chartColors[index % chartColors.length],
                    backgroundColor: chartColor(index),
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
                    title: { display: true, text: 'AUC Breakdown ($B)' },
                    min: 0
                }
            }
        })
    });
    createChart(credit_card_bs, {
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

    createChart(credit_card_bs_percentage, {
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

    createChart(cc_fico, {
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

    const financialStartQuarter = isRobinhood ? 'Q321' : companyBaseFinancials[0]?.Quarter;
    const financialStartYear = isRobinhood ? '2021' : yearFromQuarter(companyBaseFinancials[0]?.Quarter || 'Q100');

    const revenueFinancials = filteredFinancialRowsForChart('revenueChart', companyBaseFinancials, financialStartQuarter, financialStartYear);
    createChart(revenue, {
        type: 'bar',
        data: {
            labels: revenueFinancials.map(row => row.Quarter),
            datasets: Object.keys(revenueFinancials[0])
            .filter(key => key === 'Revenue' || key === 'NetIncome')
            .map((key, index) => ({
                    label: key,
                    data: revenueFinancials.map(row => row[key]),
                    borderColor: key === 'Revenue' ? 'hsl(220, 85%, 45%)' : 'hsl(120, 65%, 40%)',
                    backgroundColor: revenueFinancials.map(row => 
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

    const transactionRevenueFinancials = filteredFinancialRowsForChart('transactionRevenueBreakdown', companyBaseFinancials, 'Q321', '2021').filter(row =>
        row.TransactionRevenue !== undefined &&
        (
            row.EquitiesRevenue !== undefined ||
            row.CryptoRevenue !== undefined ||
            row.OptionsRevenue !== undefined ||
            row.EventContractsRevenue !== undefined ||
            row.OtherTransactionRevenue !== undefined
        )
    );
    const transactionRevenueKeys = [
        ['EquitiesRevenue', 'Equities'],
        ['CryptoRevenue', 'Crypto'],
        ['OptionsRevenue', 'Options'],
        ['EventContractsRevenue', 'Event Contracts'],
        ['OtherTransactionRevenue', 'Other']
    ];

    createChart(transaction_revenue_breakdown, {
        type: 'bar',
        data: {
            labels: transactionRevenueFinancials.map(row => row.Quarter),
            datasets: transactionRevenueKeys.map(([key, label], index) => ({
                label,
                data: transactionRevenueFinancials.map(row => row[key] || 0),
                borderColor: chartColors[index % chartColors.length],
                backgroundColor: chartColor(index)
            }))
        },
        options: withDarkChartDefaults({
            plugins: {
                legend: { display: true }
            },
            scales: {
                x: {
                    stacked: true,
                    title: { display: true, text: 'Quarters' }
                },
                y: {
                    stacked: true,
                    title: { display: true, text: 'Transaction Revenue ($M)' },
                    min: 0
                }
            }
        })
    });

    const transactionRevenueMixFinancials = filteredFinancialRowsForChart('transactionRevenueMixPercentage', companyBaseFinancials, 'Q321', '2021').filter(row =>
        row.TransactionRevenue !== undefined &&
        (
            row.EquitiesRevenue !== undefined ||
            row.CryptoRevenue !== undefined ||
            row.OptionsRevenue !== undefined ||
            row.EventContractsRevenue !== undefined ||
            row.OtherTransactionRevenue !== undefined
        )
    );

    createChart(transaction_revenue_mix_percentage, {
        type: 'bar',
        data: {
            labels: transactionRevenueMixFinancials.map(row => row.Quarter),
            datasets: transactionRevenueKeys.map(([key, label], index) => ({
                label,
                data: transactionRevenueMixFinancials.map(row => {
                    const total = transactionRevenueKeys.reduce((sum, [transactionKey]) => sum + (row[transactionKey] || 0), 0);
                    return total ? (row[key] || 0) / total * 100 : 0;
                }),
                borderColor: chartColors[index % chartColors.length],
                backgroundColor: chartColor(index)
            }))
        },
        options: withDarkChartDefaults({
            plugins: {
                legend: { display: true }
            },
            scales: {
                x: {
                    stacked: true,
                    title: { display: true, text: 'Quarters' }
                },
                y: {
                    stacked: true,
                    title: { display: true, text: 'Transaction Revenue Mix (%)' },
                    min: 0,
                    max: 100
                }
            }
        })
    });

    const revenueMixFinancials = filteredFinancialRowsForChart('revenueMix', companyBaseFinancials, financialStartQuarter, financialStartYear);
    const revenueMixKeys = isRobinhood
        ? [
            ['TransactionRevenue', 'Transaction Revenue'],
            ['NetInterestRevenue', 'Net Interest'],
            ['OtherRevenue', 'Other']
        ]
        : [
            ['CompanyOperatedStoresRevenue', 'Company Operated Stores'],
            ['LicensedStoresRevenue', 'Licensed Stores'],
            ['ChannelDevelopmentSegmentRevenue', 'Channel Development'],
            ['OtherRevenue', 'Other']
        ];

    createChart(revenue_mix, {
        type: 'bar',
        data: {
            labels: revenueMixFinancials.map(row => row.Quarter),
            datasets: revenueMixKeys.map(([key, label], index) => ({
                label,
                data: revenueMixFinancials.map(row => row[key] || 0),
                borderColor: chartColors[index % chartColors.length],
                backgroundColor: chartColor(index)
            }))
        },
        options: withDarkChartDefaults({
            plugins: {
                legend: { display: true }
            },
            scales: {
                x: {
                    stacked: true,
                    title: { display: true, text: 'Quarters' }
                },
                y: {
                    stacked: true,
                    title: { display: true, text: 'Revenue ($M)' },
                    min: 0
                }
            }
        })
    });

    const starbucksRevenueBreakdownFinancials = filteredFinancialRowsForChart('starbucksRevenueBreakdown', companyBaseFinancials, financialStartQuarter, financialStartYear);
    const starbucksRevenueBreakdownKeys = [
        ['CompanyOperatedStoresRevenue', 'Company Operated Stores'],
        ['LicensedStoresRevenue', 'Licensed Stores'],
        ['ChannelDevelopmentSegmentRevenue', 'Channel Development'],
        ['OtherRevenue', 'Other']
    ];

    createChart(starbucks_revenue_breakdown, {
        type: 'bar',
        data: {
            labels: starbucksRevenueBreakdownFinancials.map(row => row.Quarter),
            datasets: starbucksRevenueBreakdownKeys.map(([key, label], index) => ({
                label,
                data: starbucksRevenueBreakdownFinancials.map(row => row[key] || 0),
                borderColor: chartColors[index % chartColors.length],
                backgroundColor: chartColor(index)
            }))
        },
        options: withDarkChartDefaults({
            plugins: {
                legend: { display: true }
            },
            scales: {
                x: {
                    stacked: true,
                    title: { display: true, text: 'Quarters' }
                },
                y: {
                    stacked: true,
                    title: { display: true, text: 'Revenue ($M)' },
                    min: 0
                }
            }
        })
    });

    const revenueMixPercentageFinancials = filteredFinancialRowsForChart('revenueMixPercentage', companyBaseFinancials, financialStartQuarter, financialStartYear);

    createChart(revenue_mix_percentage, {
        type: 'bar',
        data: {
            labels: revenueMixPercentageFinancials.map(row => row.Quarter),
            datasets: revenueMixKeys.map(([key, label], index) => ({
                label,
                data: revenueMixPercentageFinancials.map(row => {
                    const total = revenueMixKeys.reduce((sum, [mixKey]) => sum + (row[mixKey] || 0), 0);
                    return total ? (row[key] || 0) / total * 100 : 0;
                }),
                borderColor: chartColors[index % chartColors.length],
                backgroundColor: chartColor(index)
            }))
        },
        options: withDarkChartDefaults({
            plugins: {
                legend: { display: true }
            },
            scales: {
                x: {
                    stacked: true,
                    title: { display: true, text: 'Quarters' }
                },
                y: {
                    stacked: true,
                    title: { display: true, text: 'Revenue Mix (%)' },
                    min: 0,
                    max: 100
                }
            }
        })
    });

    const revenuePlatformFinancials = filteredFinancialRowsForChart('revenuePlatformAssets', companyBaseFinancials, 'Q321', '2021').filter(row =>
        row.Revenue !== undefined &&
        row.TotalPlatform !== undefined &&
        row.TotalCustomers !== undefined
    );

    createChart(revenue_platform_assets, {
        type: 'bar',
        data: {
            labels: revenuePlatformFinancials.map(row => row.Quarter),
            datasets: [
                {
                    label: 'Revenue ($M)',
                    data: revenuePlatformFinancials.map(row => row.Revenue),
                    backgroundColor: 'hsla(220, 85%, 45%, 0.7)',
                    borderColor: 'hsl(220, 85%, 45%)',
                    yAxisID: 'yRevenue'
                },
                {
                    label: 'Platform Assets ($B)',
                    data: revenuePlatformFinancials.map(row => row.TotalPlatform),
                    type: 'line',
                    borderColor: '#00C805',
                    backgroundColor: 'rgba(0, 200, 5, 0.1)',
                    fill: false,
                    tension: 0.3,
                    yAxisID: 'yAssets'
                }
            ]
        },
        options: withDarkChartDefaults({
            plugins: {
                legend: { display: true }
            },
            scales: {
                yRevenue: {
                    type: 'linear',
                    position: 'left',
                    title: { display: true, text: 'Revenue ($M)' },
                    min: 0
                },
                yAssets: {
                    type: 'linear',
                    position: 'right',
                    title: { display: true, text: 'Platform Assets ($B)' },
                    min: 0,
                    grid: { drawOnChartArea: false }
                }
            }
        })
    });

    const revenuePerCustomerFinancials = filteredFinancialRowsForChart('revenuePerCustomer', companyBaseFinancials, 'Q321', '2021').filter(row =>
        row.Revenue !== undefined &&
        row.TotalPlatform !== undefined &&
        row.TotalCustomers !== undefined
    );
    const financialsWithMarketing = revenuePerCustomerFinancials.filter(row =>
        row.Marketing !== undefined
    );
    const financialsWithOperatingExpenses = revenuePerCustomerFinancials.filter(row =>
        row.OperatingExpenses !== undefined
    );

    createChart(revenue_per_customer, {
        type: 'line',
        data: {
            labels: revenuePerCustomerFinancials.map(row => row.Quarter),
            datasets: [
                greenLineDataset(
                    'Revenue per Funded Customer ($)',
                    revenuePerCustomerFinancials.map(row => row.Revenue / row.TotalCustomers * 1000)
                ),
                {
                    label: 'Marketing Spend per Funded Customer ($)',
                    data: financialsWithMarketing.map(row => row.Marketing / row.TotalCustomers * 1000),
                    borderColor: 'rgba(255, 159, 64, 0.9)',
                    backgroundColor: 'rgba(255, 159, 64, 0.1)',
                    fill: false,
                    tension: 0.3
                },
                {
                    label: 'Operating Expenses Ex. Credit Losses per Funded Customer ($)',
                    data: financialsWithOperatingExpenses.map(row =>
                        (row.OperatingExpenses - (row.ProvisionForCreditLosses || 0)) / row.TotalCustomers * 1000
                    ),
                    borderColor: 'rgba(214, 39, 40, 0.9)',
                    backgroundColor: 'rgba(214, 39, 40, 0.1)',
                    fill: false,
                    tension: 0.3
                },
                {
                    label: 'Provision for Credit Losses per Funded Customer ($)',
                    data: financialsWithOperatingExpenses.map(row =>
                        (row.ProvisionForCreditLosses || 0) / row.TotalCustomers * 1000
                    ),
                    borderColor: 'rgba(148, 103, 189, 0.9)',
                    backgroundColor: 'rgba(148, 103, 189, 0.1)',
                    fill: false,
                    tension: 0.3
                },
                {
                    label: 'Platform Assets per Funded Customer ($)',
                    data: revenuePerCustomerFinancials.map(row => row.TotalPlatform / row.TotalCustomers * 1000000),
                    borderColor: 'rgba(31, 119, 180, 0.9)',
                    backgroundColor: 'rgba(31, 119, 180, 0.1)',
                    fill: false,
                    tension: 0.3,
                    yAxisID: 'yAssetsPerCustomer'
                }
            ]
        },
        options: withDarkChartDefaults({
            scales: {
                y: {
                    title: { display: true, text: 'Revenue per Customer ($)' },
                    min: 0
                },
                yAssetsPerCustomer: {
                    type: 'linear',
                    position: 'right',
                    title: { display: true, text: 'Assets per Customer ($)' },
                    min: 0,
                    grid: { drawOnChartArea: false }
                }
            }
        })
    });

    const platformAssetsPerCustomerFinancials = filteredFinancialRowsForChart('platformAssetsPerCustomer', companyBaseFinancials, 'Q321', '2021').filter(row =>
        row.TotalPlatform !== undefined &&
        row.TotalCustomers !== undefined
    );

    createChart(platform_assets_per_customer, {
        type: 'line',
        data: {
            labels: platformAssetsPerCustomerFinancials.map(row => row.Quarter),
            datasets: [
                greenLineDataset(
                    'Platform Assets per Funded Customer ($)',
                    platformAssetsPerCustomerFinancials.map(row => row.TotalPlatform / row.TotalCustomers * 1000000)
                )
            ]
        },
        options: withDarkChartDefaults({
            scales: {
                y: {
                    title: { display: true, text: 'Platform Assets per Customer ($)' },
                    min: 0
                }
            }
        })
    });

    const goldSubscriberFinancials = filteredFinancialRowsForChart('goldSubscribers', companyBaseFinancials, 'Q322', '2022');

    createChart(gold_subscribers, {
        type: 'line',
        data: {
        labels: goldSubscriberFinancials.map(row => row.Quarter),
            datasets: [
                greenLineDataset(
                    'Gold Subscribers (M)',
                    goldSubscriberFinancials.map(row => row.Gold || 0)
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

    const goldShareFinancials = filteredFinancialRowsForChart('goldShare', companyBaseFinancials, 'Q322', '2022');

    createChart(gold_share, {
        type: 'line',
        data: {
            labels: goldShareFinancials.map(row => row.Quarter),
            datasets: [
                greenLineDataset(
                    'Gold Share of Total Customers (%)',
                    goldShareFinancials.map(row => (row.Gold / row.TotalCustomers) * 100)
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

    const creditCardFinancials = filteredFinancialRowsForChart('creditCardProvisions', companyBaseFinancials, 'Q423', '2023');

    createChart(credit_card_provisions, {
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
    
    createChart(ctxBanking, {
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

    createChart(ctxBankingAUM, {
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

    createChart(ctxGrowth, {
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

    activeRenderChartId = null;
}

setupChartPeriodControls();
setupCompanyTabs();
updateCompanyVisibility();
loadChartData();
