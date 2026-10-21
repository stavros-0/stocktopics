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
    const canvas = document.getElementById(id);
    return canvas ? canvas.getContext('2d') : null;
}

function setupChartContainers() {
    document.querySelectorAll('.dashboard-view .card > canvas').forEach(canvas => {
        const container = document.createElement('div');
        container.className = 'chart-container';
        canvas.removeAttribute('width');
        canvas.removeAttribute('height');
        canvas.before(container);
        container.append(canvas);
    });
}

const periodChartIds = new Set([
    'equityAssets',
    'cryptoAssets',
    'cryptoRevenueAssets',
    'optionsAssets',
    'aucBreakdown',
    'revenueChart',
    'expenseMix',
    'expenseMixPercentage',
    'transactionRevenueBreakdown',
    'transactionRevenueMixPercentage',
    'revenueMix',
    'starbucksRevenueBreakdown',
    'revenueMixPercentage',
    'nikeProductMix',
    'nikeProductMixPercentage',
    'nikeChannelMix',
    'nikeChannelMixPercentage',
    'nikeExpenseMix',
    'nikeExpenseMixPercentage',
    'nikeRevenueVsExpenses',
    'netInterestBreakdown',
    'netInterestMixPercentage',
    'revenuePlatformAssets',
    'platformAssetsPerCustomer',
    'goldSubscribers',
    'goldShare',
    'creditCardProvisions',
    'dilutedShares'
]);

const chartPeriods = {};
let activeRenderChartId = null;
let cachedDashboardData = null;
let dynamicCharts = [];
const chartInstances = {};
let selectedCompany = 'Robinhood';
let activeView = 'home';
let robinhoodLayout = null;
let cachedRotheraSnapshot = null;
let activeRotheraFilter = 'All';

const rotheraProductNames = {
    NFLGAME: 'NFL games', NFLSPREAD: 'NFL spreads', NFLTOTAL: 'NFL totals', NFL: 'NFL season futures',
    MLBGAME: 'MLB games', MLBSPREAD: 'MLB spreads', MLBTOTAL: 'MLB totals',
    NBAGAME: 'NBA games', NBASPREAD: 'NBA spreads', NBATOTAL: 'NBA totals', NBA: 'NBA season futures',
    NHLGAME: 'NHL games', NHLSPREAD: 'NHL spreads', NHLTOTAL: 'NHL totals',
    SENRACE: 'Senate races', GOVRACE: 'Governor races', HOURACE: 'House races',
    CNTRLHOU: 'House control', CNTRLSEN: 'Senate control', CNTRLCONG: 'Congress control',
    ECUSFED: 'Fed rate decision', ECUNEMP: 'Unemployment claims', ECPCE: 'PCE inflation'
};

const robinhoodSections = [
    {
        id: 'robinhood-overview',
        title: 'Overview',
        preview: { field: 'Revenue', label: 'Revenue', divisor: 1000, decimals: 2, suffix: 'B', prefix: '$' },
        chartIds: ['revenueChart', 'fundedCustomers', 'platformAssets', 'netDeposits', 'velocityChart', 'goldSubscribers', 'goldShare', 'growthChart']
    },
    {
        id: 'robinhood-assets',
        title: 'Customers & assets',
        preview: { field: 'TotalCustomers', label: 'Funded customers', divisor: 1000, decimals: 1, suffix: 'M', prefix: '' },
        chartIds: ['aucBreakdown', 'revenuePlatformAssets', 'cryptoRevenueAssets', 'equityAssets', 'cryptoAssets', 'optionsAssets', 'platformAssetsPerCustomer']
    },
    {
        id: 'robinhood-trading',
        title: 'Transaction Volumes',
        preview: { field: 'CryptoRevenue', label: 'Crypto revenue', divisor: 1, decimals: 0, suffix: 'M', prefix: '$' },
        chartIds: ['equities', 'crypto', 'options']
    },
    {
        id: 'robinhood-breakdowns',
        title: 'Breakdowns & mix',
        preview: { field: 'TransactionRevenue', label: 'Transaction revenue', divisor: 1, decimals: 0, suffix: 'M', prefix: '$' },
        chartIds: ['revenueMix', 'revenueMixPercentage', 'transactionRevenueBreakdown', 'transactionRevenueMixPercentage', 'expenseMix', 'expenseMixPercentage', 'netInterestBreakdown', 'netInterestMixPercentage']
    },
    {
        id: 'robinhood-banking',
        title: 'Banking & credit',
        preview: { field: 'CashSweepRevenue', label: 'Cash sweep revenue', divisor: 1, decimals: 0, suffix: 'M', prefix: '$' },
        chartIds: ['bankingChart', 'bankingAUM', 'margin', 'cashSweep', 'creditCardProvisions', 'creditCardBalanceSheet', 'creditCardBalanceSheetPercentage', 'creditCardFICO']
    }
];

function setupRobinhoodSections() {
    const dashboard = document.querySelector('[data-app-view="dashboard"]');
    const dashboardGrid = dashboard.querySelector('.grid');
    const originalCards = [...dashboardGrid.children];
    const cardsByChartId = new Map(originalCards.map(card => [card.querySelector('canvas')?.id, card]));
    const groupCards = document.createElement('div');
    const backButton = document.createElement('button');
    const sectionContainer = document.createElement('div');
    const rotheraSection = dashboard.querySelector('#robinhood-rothera');

    groupCards.className = 'robinhood-group-grid is-hidden';
    backButton.type = 'button';
    backButton.className = 'robinhood-detail-back is-hidden';
    backButton.textContent = '← All Robinhood topics';
    sectionContainer.className = 'robinhood-sections is-hidden';

    const groups = robinhoodSections.map((section, index) => {
        const button = document.createElement('button');
        const number = document.createElement('span');
        const title = document.createElement('span');
        const metric = document.createElement('span');
        const metricLabel = document.createElement('span');
        const metricValue = document.createElement('strong');
        const metricQuarter = document.createElement('small');
        const sparkline = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
        const sparklineLine = document.createElementNS('http://www.w3.org/2000/svg', 'polyline');
        const arrow = document.createElement('span');
        const sectionElement = document.createElement('section');
        const heading = document.createElement('h2');
        const grid = document.createElement('div');

        button.type = 'button';
        button.className = 'robinhood-group-card';
        number.className = 'robinhood-group-card__number';
        number.textContent = String(index + 1).padStart(2, '0');
        title.className = 'robinhood-group-card__title';
        title.textContent = section.title;
        metric.className = 'robinhood-group-card__metric';
        metricLabel.textContent = section.preview.label;
        metricValue.textContent = '—';
        metric.append(metricLabel, metricValue, metricQuarter);
        sparkline.classList.add('robinhood-group-card__sparkline');
        sparkline.setAttribute('viewBox', '0 0 280 68');
        sparkline.setAttribute('preserveAspectRatio', 'none');
        sparkline.setAttribute('aria-hidden', 'true');
        sparkline.append(sparklineLine);
        arrow.className = 'robinhood-group-card__arrow';
        arrow.textContent = '↗';
        arrow.setAttribute('aria-hidden', 'true');
        button.append(number, title, metric, sparkline, arrow);
        groupCards.append(button);

        sectionElement.id = section.id;
        sectionElement.className = 'robinhood-section is-hidden';
        heading.textContent = section.title;
        grid.className = 'grid';
        sectionElement.append(heading, grid);
        sectionContainer.append(sectionElement);

        button.addEventListener('click', () => {
            showRobinhoodGroup(section.id);
            window.scrollTo(0, 0);
            loadChartData().catch(showDashboardError);
        });

        return { sectionElement, grid, cards: section.chartIds.map(chartId => cardsByChartId.get(chartId)), metricValue, metricQuarter, sparklineLine };
    });

    groupCards.append(document.querySelector('#robinhood-additional-topics').content.cloneNode(true));
    sectionContainer.append(rotheraSection);

    groupCards.querySelector('[data-rothera-card]').addEventListener('click', () => {
        showRobinhoodGroup('robinhood-rothera');
        window.scrollTo(0, 0);
        loadRotheraDashboard().catch(showDashboardError);
    });

    rotheraSection.querySelector('.rothera-filters').addEventListener('click', event => {
        const button = event.target.closest('[data-rothera-filter]');
        if (!button || !cachedRotheraSnapshot) {
            return;
        }

        activeRotheraFilter = button.dataset.rotheraFilter;
        rotheraSection.querySelectorAll('[data-rothera-filter]').forEach(filterButton => {
            const isActive = filterButton === button;
            filterButton.classList.toggle('is-active', isActive);
            filterButton.setAttribute('aria-pressed', String(isActive));
        });
        renderRotheraProducts(cachedRotheraSnapshot);
    });

    backButton.addEventListener('click', () => {
        clearDynamicCharts();
        showRobinhoodGroup(null);
        window.scrollTo(0, 0);
    });

    dashboard.prepend(groupCards, backButton, sectionContainer);
    robinhoodLayout = { dashboardGrid, originalCards, groupCards, backButton, sectionContainer, rotheraSection, groups, isGrouped: false };
}

function showRobinhoodGroup(sectionId) {
    const { groupCards, backButton, sectionContainer, rotheraSection, groups } = robinhoodLayout;
    const isDetail = Boolean(sectionId);

    groupCards.classList.toggle('is-hidden', isDetail);
    backButton.classList.toggle('is-hidden', !isDetail);
    sectionContainer.classList.toggle('is-hidden', !isDetail);
    groups.forEach(({ sectionElement }) => {
        sectionElement.classList.toggle('is-hidden', sectionElement.id !== sectionId);
    });
    rotheraSection.classList.toggle('is-hidden', rotheraSection.id !== sectionId);
}

function updateRobinhoodSections() {
    const isRobinhood = selectedCompany === 'Robinhood';
    const { dashboardGrid, originalCards, groupCards, backButton, sectionContainer, groups } = robinhoodLayout;

    if (robinhoodLayout.isGrouped === isRobinhood) {
        if (isRobinhood) {
            clearDynamicCharts();
            showRobinhoodGroup(null);
        }
        return;
    }

    clearDynamicCharts();
    if (isRobinhood) {
        groups.forEach(({ grid, cards }) => grid.append(...cards));
    } else {
        dashboardGrid.replaceChildren(...originalCards);
    }

    dashboardGrid.classList.toggle('is-hidden', isRobinhood);
    groupCards.classList.toggle('is-hidden', !isRobinhood);
    backButton.classList.add('is-hidden');
    sectionContainer.classList.add('is-hidden');
    robinhoodLayout.isGrouped = isRobinhood;
}

function sparklinePoints(values) {
    const minimum = Math.min(...values);
    const range = Math.max(...values) - minimum || 1;

    return values.map((value, index) => {
        const horizontal = values.length === 1 ? 140 : 4 + index * 272 / (values.length - 1);
        const vertical = 62 - (value - minimum) / range * 56;
        return `${horizontal},${vertical}`;
    }).join(' ');
}

function loadRobinhoodGroupPreviews(financials) {
    robinhoodSections.forEach((section, index) => {
        const rows = financials.filter(row => typeof row[section.preview.field] === 'number');
        const latestRow = rows.at(-1);

        if (!latestRow) {
            return;
        }

        const { metricValue, metricQuarter, sparklineLine } = robinhoodLayout.groups[index];
        const { field, divisor, decimals, suffix, prefix } = section.preview;
        metricValue.textContent = `${prefix}${(latestRow[field] / divisor).toFixed(decimals)}${suffix}`;
        metricQuarter.textContent = `Q${latestRow.Quarter.slice(1, 2)} 20${latestRow.Quarter.slice(2)}`;
        sparklineLine.setAttribute('points', sparklinePoints(rows.slice(-8).map(row => row[field])));
    });
}

function formatRotheraVolume(volume) {
    return new Intl.NumberFormat('en-US', { notation: 'compact', maximumFractionDigits: 2 }).format(volume);
}

async function loadRotheraSnapshot() {
    if (!cachedRotheraSnapshot) {
        cachedRotheraSnapshot = await loadJson('./data/rothera_snapshot.json');
    }

    document.querySelector('[data-rothera-card-volume]').textContent = formatRotheraVolume(cachedRotheraSnapshot.totalVolume);
    document.querySelector('[data-rothera-card-date]').textContent = cachedRotheraSnapshot.date;
    return cachedRotheraSnapshot;
}

function renderRotheraProducts(snapshot) {
    const list = robinhoodLayout.rotheraSection.querySelector('[data-rothera-products]');
    const products = snapshot.products.filter(product =>
        product.volume > 0 && (activeRotheraFilter === 'All' || product.category === activeRotheraFilter)
    ).slice(0, 8);

    list.replaceChildren();
    if (!products.length) {
        const empty = document.createElement('li');
        empty.className = 'rothera-products__empty';
        empty.textContent = 'No volume in this topic on this date.';
        list.append(empty);
        return;
    }

    const highestVolume = products[0].volume;
    products.forEach((product, index) => {
        const item = document.createElement('li');
        const name = document.createElement('span');
        const code = document.createElement('small');
        const volume = document.createElement('strong');
        const track = document.createElement('span');
        const bar = document.createElement('span');

        item.className = 'rothera-products__item';
        name.className = 'rothera-products__name';
        name.textContent = `${String(index + 1).padStart(2, '0')}  ${rotheraProductNames[product.code] || product.code}`;
        code.textContent = product.code;
        volume.textContent = formatRotheraVolume(product.volume);
        volume.title = `${product.volume.toLocaleString()} contracts`;
        track.className = 'rothera-products__track';
        bar.style.width = `${product.volume / highestVolume * 100}%`;
        track.append(bar);
        item.append(name, code, volume, track);
        list.append(item);
    });
}

async function loadRotheraDashboard() {
    const snapshot = await loadRotheraSnapshot();
    if (robinhoodLayout.rotheraSection.classList.contains('is-hidden')) {
        return;
    }

    const dashboard = robinhoodLayout.rotheraSection;
    const date = dashboard.querySelector('[data-rothera-date]');
    date.dateTime = snapshot.date;
    date.textContent = new Date(`${snapshot.date}T00:00:00`).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
    dashboard.querySelector('[data-rothera-stat="total"]').textContent = formatRotheraVolume(snapshot.totalVolume);
    snapshot.categories.forEach(category => {
        const stat = [...dashboard.querySelectorAll('[data-rothera-stat]')].find(element => element.dataset.rotheraStat === category.name);
        if (stat) {
            stat.textContent = formatRotheraVolume(category.volume);
            stat.title = `${category.volume.toLocaleString()} contracts`;
        }
    });

    const categories = snapshot.categories.filter(category => category.volume > 0);
    createChart(getChartContext('rotheraCategoryVolume'), {
        type: 'bar',
        data: {
            labels: categories.map(category => category.name),
            datasets: [{
                label: 'Contracts',
                data: categories.map(category => category.volume),
                backgroundColor: ['#A7C9A4', '#C8B29B', '#92A8BF', '#B79AB0', '#A3AAA0']
            }]
        },
        options: withDarkChartDefaults({
            indexAxis: 'y',
            plugins: {
                legend: { display: false },
                tooltip: { callbacks: { label: context => `${context.parsed.x.toLocaleString()} contracts` } }
            },
            scales: {
                x: { ticks: { callback: value => formatRotheraVolume(value) } },
                y: { grid: { display: false } }
            }
        })
    });
    renderRotheraProducts(snapshot);
}

async function loadHomeCompanyCards() {
    try {
        const companies = await loadJson('./data/financials.json');

        loadRobinhoodGroupPreviews(companies.find(company => company.Company === 'Robinhood').Financials);

        companies.forEach(({ Company: company, Financials: financials }) => {
            const revenueRows = financials.filter(row => typeof row.Revenue === 'number');
            const latestRow = revenueRows.at(-1);
            const revenueElement = document.querySelector(`[data-home-revenue="${company}"]`);
            const quarterElement = document.querySelector(`[data-home-quarter="${company}"]`);
            const sparkline = document.querySelector(`[data-home-sparkline="${company}"]`);

            if (!latestRow || !revenueElement || !quarterElement || !sparkline) {
                return;
            }

            revenueElement.textContent = `$${(latestRow.Revenue / 1000).toFixed(2)}B`;
            quarterElement.textContent = `Q${latestRow.Quarter.slice(1, 2)} 20${latestRow.Quarter.slice(2)}`;

            sparkline.setAttribute('points', sparklinePoints(revenueRows.slice(-8).map(row => row.Revenue)));
        });
    } catch (error) {
        console.warn('Could not load home company financials', error);
    }
}

function showDashboardError(error) {
    let errorBox = document.getElementById('dashboardError');

    if (!errorBox) {
        errorBox = document.createElement('div');
        errorBox.id = 'dashboardError';
        errorBox.className = 'dashboard-error';
        document.querySelector('[data-dashboard-controls]')?.after(errorBox);
    }

    errorBox.textContent = `Dashboard data could not load: ${error.message}`;
}

function renderNetInterestLegend(chart) {
    const card = chart.canvas.closest('.card');
    let legend = card.querySelector('.net-interest-legend');

    if (!legend) {
        legend = document.createElement('details');
        legend.className = 'net-interest-legend';
        card.append(legend);
    }

    const summary = document.createElement('summary');
    const items = document.createElement('div');
    summary.textContent = 'Legend';
    items.className = 'net-interest-legend__items';
    legend.replaceChildren(summary, items);
    chart.data.datasets.forEach((dataset, index) => {
        const button = document.createElement('button');
        const swatch = document.createElement('span');
        const label = document.createElement('span');

        button.type = 'button';
        button.className = 'net-interest-legend__item';
        button.setAttribute('aria-pressed', String(chart.isDatasetVisible(index)));
        swatch.className = 'net-interest-legend__swatch';
        swatch.style.backgroundColor = dataset.borderColor;
        swatch.setAttribute('aria-hidden', 'true');
        label.textContent = dataset.label;
        button.append(swatch, label);
        button.addEventListener('click', () => {
            const visible = !chart.isDatasetVisible(index);
            chart.setDatasetVisibility(index, visible);
            chart.update();
            button.setAttribute('aria-pressed', String(visible));
        });
        items.append(button);
    });
}

function createChart(context, config) {
    if (!context) {
        return null;
    }

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
    if (chartId === 'netInterestBreakdown' || chartId === 'netInterestMixPercentage') {
        renderNetInterestLegend(chart);
    }
    return chart;
}

function clearDynamicCharts() {
    dynamicCharts.forEach(chart => chart.destroy());
    dynamicCharts = [];
    document.querySelectorAll('.net-interest-legend').forEach(legend => legend.remove());
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
            credit_card: await loadJson('./data/credit_card.json'),
            nike_product_roadmap: await loadOptionalJson('./data/nike_product_roadmap.json', []),
            nike_q1_27_themes: await loadOptionalJson('./data/nike_q1_27_themes.json', null)
        };
    }

    return cachedDashboardData;
}

async function loadOptionalJson(path, fallback) {
    try {
        return await loadJson(path);
    } catch (error) {
        console.warn(`Could not load optional dashboard data: ${path}`, error);
        return fallback;
    }
}

function yearFromQuarter(quarter) {
    return `20${quarter.slice(2)}`;
}

function quarterFromMonth(month) {
    const [monthNumber, yearSuffix] = month.split('/').map(Number);
    return `Q${Math.ceil(monthNumber / 3)}${String(yearSuffix).padStart(2, '0')}`;
}

function quarterlyAverageStockPrice(rows) {
    const groups = rows.reduce((quarterlyRows, row) => {
        if (row.StockLow === undefined || row.StockHigh === undefined) {
            return quarterlyRows;
        }

        const quarter = quarterFromMonth(row.Month);
        quarterlyRows[quarter] = quarterlyRows[quarter] || [];
        quarterlyRows[quarter].push((row.StockLow + row.StockHigh) / 2);
        return quarterlyRows;
    }, {});

    return Object.entries(groups).reduce((prices, [quarter, values]) => {
        prices[quarter] = values.reduce((sum, value) => sum + value, 0) / values.length;
        return prices;
    }, {});
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
        canvas.closest('.chart-container').before(toggle);

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
    document.querySelector('[data-current-company]').textContent = selectedCompany;
    document.querySelector('[data-company-logo]').src = {
        Robinhood: './src/assets/robinhood.svg',
        Starbucks: './src/assets/starbucks.svg',
        Nike: './src/assets/nike.svg'
    }[selectedCompany];
    updateRobinhoodSections();

    document.querySelectorAll('[data-company-only]').forEach(element => {
        element.classList.toggle('is-hidden', activeView === 'home' || element.dataset.companyOnly !== selectedCompany);
    });
}

function updateViewVisibility() {
    const visibleView = activeView === 'home' ? 'home' : selectedCompany === 'Nike' ? activeView : 'dashboard';

    document.querySelector('[data-dashboard-controls]').classList.toggle('is-hidden', activeView === 'home');
    document.querySelectorAll('[data-app-view]').forEach(view => {
        view.classList.toggle('is-hidden', view.dataset.appView !== visibleView);
    });
}

function updateViewTabs() {
    document.querySelectorAll('[data-view]').forEach(button => {
        button.classList.toggle('is-active', button.dataset.view === activeView);
    });
}

function updateTopNavigation() {
    document.querySelectorAll('.site-nav [data-home], .site-nav [data-open-company]').forEach(button => {
        const isActive = button.hasAttribute('data-home')
            ? activeView === 'home'
            : activeView !== 'home' && button.dataset.openCompany === selectedCompany;

        button.classList.toggle('is-active', isActive);
        if (isActive) {
            button.setAttribute('aria-current', 'page');
        } else {
            button.removeAttribute('aria-current');
        }
    });
}

function setupCompanyTabs() {
    function showHome() {
        activeView = 'home';
        updateTopNavigation();
        updateCompanyVisibility();
        updateViewVisibility();
    }

    document.querySelector('[data-home]').addEventListener('click', () => {
        showHome();
        window.scrollTo(0, 0);
    });

    document.querySelectorAll('[data-open-company]').forEach(button => {
        button.addEventListener('click', () => {
            selectedCompany = button.dataset.openCompany;
            activeView = 'dashboard';
            updateTopNavigation();
            updateViewTabs();
            updateCompanyVisibility();
            updateViewVisibility();
            setupChartPeriodControls();
            window.scrollTo(0, 0);
            if (selectedCompany !== 'Robinhood') {
                loadChartData().catch(showDashboardError);
            }
        });
    });
}

function setupViewTabs() {
    document.querySelectorAll('[data-view]').forEach(button => {
        button.addEventListener('click', () => {
            activeView = button.dataset.view;
            updateViewTabs();
            updateViewVisibility();
        });
    });
}

function roadmapStatus(item) {
    if (!item.ReleaseDateISO) {
        return 'TBD';
    }

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const releaseDate = new Date(`${item.ReleaseDateISO}T00:00:00`);
    return releaseDate < today ? 'Released' : 'Upcoming';
}

function renderProductRoadmap(rows) {
    const tableBody = document.getElementById('nikeProductRoadmap');

    if (!tableBody) {
        return;
    }

    tableBody.replaceChildren();

    rows.forEach(item => {
        const status = roadmapStatus(item);
        const row = document.createElement('tr');
        const dateCell = document.createElement('td');
        const productCell = document.createElement('td');
        const categoryCell = document.createElement('td');
        const statusCell = document.createElement('td');
        const notesCell = document.createElement('td');
        const statusBadge = document.createElement('span');

        dateCell.textContent = item.ReleaseDate || 'TBD';
        productCell.textContent = item.Product;
        categoryCell.textContent = item.Category || 'Other';
        statusBadge.textContent = status;
        statusBadge.className = `roadmap-status roadmap-status--${status.toLowerCase()}`;
        statusCell.append(statusBadge);
        notesCell.textContent = item.Notes || '';

        row.append(dateCell, productCell, categoryCell, statusCell, notesCell);
        tableBody.append(row);
    });
}

function renderStackedMixChart(context, rows, keys, title, percentage = false) {
    createChart(context, {
        type: 'bar',
        data: {
            labels: rows.map(row => row.Quarter),
            datasets: keys.map(([key, label], index) => ({
                label,
                data: rows.map(row => {
                    if (!percentage) {
                        return row[key] || 0;
                    }

                    const total = keys.reduce((sum, [mixKey]) => sum + (row[mixKey] || 0), 0);
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
                    title: { display: true, text: title },
                    min: 0,
                    ...(percentage ? { max: 100 } : {})
                }
            }
        })
    });
}

function renderNikeThemes(data) {
    const summary = document.getElementById('nikeThemesSummary');
    const statsContainer = document.getElementById('nikeThemeStats');
    const pressureContainer = document.getElementById('nikePressureThemes');
    const highlightContainer = document.getElementById('nikeHighlightThemes');

    if (!summary || !statsContainer || !pressureContainer || !highlightContainer) {
        return;
    }

    if (!data) {
        summary.textContent = '';
        statsContainer.replaceChildren();
        pressureContainer.replaceChildren();
        highlightContainer.replaceChildren();
        return;
    }

    summary.textContent = data.Summary;
    statsContainer.replaceChildren();
    pressureContainer.replaceChildren();
    highlightContainer.replaceChildren();

    data.Stats.forEach(stat => {
        const tile = document.createElement('div');
        const label = document.createElement('div');
        const value = document.createElement('div');

        tile.className = `theme-stat theme-stat--${stat.Tone}`;
        label.className = 'theme-stat__label';
        value.className = 'theme-stat__value';
        label.textContent = stat.Label;
        value.textContent = stat.Value;
        tile.append(label, value);
        statsContainer.append(tile);
    });

    data.Themes.forEach(theme => {
        const card = document.createElement('article');
        const title = document.createElement('h4');
        const headline = document.createElement('p');
        const list = document.createElement('ul');

        card.className = `theme-card theme-card--${theme.Tone}`;
        title.textContent = theme.Name;
        headline.textContent = theme.Headline;

        theme.Details.forEach(detail => {
            const item = document.createElement('li');
            item.textContent = detail;
            list.append(item);
        });

        card.append(title, headline, list);

        if (theme.Tone === 'negative') {
            pressureContainer.append(card);
        } else {
            highlightContainer.append(card);
        }
    });
}

async function loadChartData(chartId = null) {
    activeRenderChartId = chartId;

    if (!chartId) {
        clearDynamicCharts();
    }

    const { monthly_metrics, financials, credit_card, nike_product_roadmap, nike_q1_27_themes } = await getDashboardData();
    const companyData = financials.find(company => company.Company === selectedCompany);
    const companyBaseFinancials = companyData.Financials;
    const isRobinhood = selectedCompany === 'Robinhood';

    renderProductRoadmap(nike_product_roadmap);
    renderNikeThemes(nike_q1_27_themes);

    const ctxBanking = getChartContext('bankingChart');
    const ctxBankingAUM = getChartContext('bankingAUM');
    const ctxGrowth = getChartContext('growthChart');
    const ctx1 = getChartContext('equities');
    const equity_assets = getChartContext('equityAssets');
    const crypto_assets = getChartContext('cryptoAssets');
    const crypto_revenue_assets = getChartContext('cryptoRevenueAssets');
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
    const diluted_shares = getChartContext('dilutedShares');
    const expense_mix = getChartContext('expenseMix');
    const expense_mix_percentage = getChartContext('expenseMixPercentage');
    const transaction_revenue_breakdown = getChartContext('transactionRevenueBreakdown');
    const transaction_revenue_mix_percentage = getChartContext('transactionRevenueMixPercentage');
    const revenue_mix = getChartContext('revenueMix');
    const starbucks_revenue_breakdown = getChartContext('starbucksRevenueBreakdown');
    const revenue_mix_percentage = getChartContext('revenueMixPercentage');
    const nike_product_mix = getChartContext('nikeProductMix');
    const nike_product_mix_percentage = getChartContext('nikeProductMixPercentage');
    const nike_channel_mix = getChartContext('nikeChannelMix');
    const nike_channel_mix_percentage = getChartContext('nikeChannelMixPercentage');
    const nike_expense_mix = getChartContext('nikeExpenseMix');
    const nike_expense_mix_percentage = getChartContext('nikeExpenseMixPercentage');
    const nike_revenue_vs_expenses = getChartContext('nikeRevenueVsExpenses');
    const net_interest_breakdown = getChartContext('netInterestBreakdown');
    const net_interest_mix_percentage = getChartContext('netInterestMixPercentage');
    const revenue_platform_assets = getChartContext('revenuePlatformAssets');
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

    const financialStartQuarter = companyBaseFinancials[0]?.Quarter;
    const financialStartYear = yearFromQuarter(companyBaseFinancials[0]?.Quarter || 'Q100');

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

    const dilutedSharesFinancials = filteredFinancialRowsForChart('dilutedShares', companyBaseFinancials, financialStartQuarter, financialStartYear).filter(row =>
        row.Shares !== undefined
    );

    createChart(diluted_shares, {
        type: 'bar',
        data: {
            labels: dilutedSharesFinancials.map(row => row.Quarter),
            datasets: [
                {
                    label: 'Diluted Shares',
                    data: dilutedSharesFinancials.map(row => row.Shares),
                    borderColor: 'hsl(220, 85%, 45%)',
                    backgroundColor: 'hsla(220, 85%, 45%, 0.7)',
                    yAxisID: 'yShares'
                },
                {
                    label: 'Revenue per Share',
                    type: 'line',
                    data: dilutedSharesFinancials.map(row => row.Revenue !== undefined ? row.Revenue / row.Shares : null),
                    borderColor: '#00C805',
                    backgroundColor: 'rgba(0, 200, 5, 0.1)',
                    fill: false,
                    tension: 0.3,
                    yAxisID: 'yPerShare'
                },
                {
                    label: 'Earnings per Share',
                    type: 'line',
                    data: dilutedSharesFinancials.map(row => row.NetIncome !== undefined ? row.NetIncome / row.Shares : null),
                    borderColor: 'rgba(255, 159, 64, 0.9)',
                    backgroundColor: 'rgba(255, 159, 64, 0.1)',
                    fill: false,
                    tension: 0.3,
                    yAxisID: 'yPerShare'
                }
            ]
        },
        options: withDarkChartDefaults({
            plugins: {
                legend: { display: true }
            },
            scales: {
                yShares: {
                    type: 'linear',
                    position: 'left',
                    title: { display: true, text: 'Diluted Shares (M)' },
                    min: 0
                },
                yPerShare: {
                    type: 'linear',
                    position: 'right',
                    title: { display: true, text: 'Per Share ($)' },
                    grid: { drawOnChartArea: false }
                }
            }
        })
    });

    const expenseMixFinancials = filteredFinancialRowsForChart('expenseMix', companyBaseFinancials, financialStartQuarter, financialStartYear).filter(row =>
        row.Revenue !== undefined &&
        (
            row.BrokerageAndTransactionExpense !== undefined ||
            row.TechnologyAndDevelopmentExpense !== undefined ||
            row.OperationsExpense !== undefined ||
            row.GeneralAndAdministrativeExpense !== undefined ||
            row.Marketing !== undefined ||
            row.ProvisionForCreditLosses !== undefined
        )
    );
    const expenseMixKeys = [
        ['BrokerageAndTransactionExpense', 'Brokerage & Transaction'],
        ['TechnologyAndDevelopmentExpense', 'Technology & Development'],
        ['OperationsExpense', 'Operations'],
        ['GeneralAndAdministrativeExpense', 'G&A'],
        ['Marketing', 'Marketing'],
        ['ProvisionForCreditLosses', 'Credit Losses']
    ];

    createChart(expense_mix, {
        type: 'bar',
        data: {
            labels: expenseMixFinancials.map(row => row.Quarter),
            datasets: [
                ...expenseMixKeys.map(([key, label], index) => ({
                    label,
                    data: expenseMixFinancials.map(row => row[key] || 0),
                    borderColor: chartColors[index % chartColors.length],
                    backgroundColor: chartColor(index),
                    yAxisID: 'y'
                })),
                {
                    label: 'Revenue',
                    data: expenseMixFinancials.map(row => row.Revenue),
                    type: 'line',
                    borderColor: '#FFFFFF',
                    backgroundColor: 'rgba(255, 255, 255, 0.1)',
                    fill: false,
                    tension: 0.3,
                    yAxisID: 'y'
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
                    title: { display: true, text: 'Quarters' }
                },
                y: {
                    stacked: true,
                    title: { display: true, text: 'Expenses / Revenue ($M)' },
                    min: 0
                }
            }
        })
    });

    const expenseMixPercentageFinancials = filteredFinancialRowsForChart('expenseMixPercentage', companyBaseFinancials, financialStartQuarter, financialStartYear).filter(row =>
        row.Revenue &&
        (
            row.BrokerageAndTransactionExpense !== undefined ||
            row.TechnologyAndDevelopmentExpense !== undefined ||
            row.OperationsExpense !== undefined ||
            row.GeneralAndAdministrativeExpense !== undefined ||
            row.Marketing !== undefined ||
            row.ProvisionForCreditLosses !== undefined
        )
    );

    createChart(expense_mix_percentage, {
        type: 'bar',
        data: {
            labels: expenseMixPercentageFinancials.map(row => row.Quarter),
            datasets: expenseMixKeys.map(([key, label], index) => ({
                label,
                data: expenseMixPercentageFinancials.map(row => {
                    const total = expenseMixKeys.reduce((sum, [expenseKey]) => sum + (row[expenseKey] || 0), 0);
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
                    title: { display: true, text: 'Expense Mix (%)' },
                    min: 0,
                    max: 100
                }
            }
        })
    });

    const transactionRevenueFinancials = filteredFinancialRowsForChart('transactionRevenueBreakdown', companyBaseFinancials, financialStartQuarter, financialStartYear).filter(row =>
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
    const quarterlyStockPrices = quarterlyAverageStockPrice(monthly_metrics);

    createChart(transaction_revenue_breakdown, {
        type: 'bar',
        data: {
            labels: transactionRevenueFinancials.map(row => row.Quarter),
            datasets: [
                ...transactionRevenueKeys.map(([key, label], index) => ({
                    label,
                    data: transactionRevenueFinancials.map(row => row[key] || 0),
                    borderColor: chartColors[index % chartColors.length],
                    backgroundColor: chartColor(index),
                    yAxisID: 'y'
                })),
                {
                    label: 'HOOD Stock Price',
                    type: 'line',
                    data: transactionRevenueFinancials.map(row => quarterlyStockPrices[row.Quarter] ?? null),
                    borderColor: '#FFFFFF',
                    backgroundColor: 'rgba(255, 255, 255, 0.1)',
                    borderWidth: 3,
                    pointRadius: 3,
                    fill: false,
                    tension: 0.25,
                    yAxisID: 'yPrice'
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
                    title: { display: true, text: 'Quarters' }
                },
                y: {
                    stacked: true,
                    title: { display: true, text: 'Transaction Revenue ($M)' },
                    min: 0
                },
                yPrice: {
                    type: 'linear',
                    position: 'right',
                    title: { display: true, text: 'HOOD Stock Price ($)' },
                    min: 0,
                    grid: { drawOnChartArea: false }
                }
            }
        })
    });

    const transactionRevenueMixFinancials = filteredFinancialRowsForChart('transactionRevenueMixPercentage', companyBaseFinancials, financialStartQuarter, financialStartYear).filter(row =>
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
            datasets: [
                ...transactionRevenueKeys.map(([key, label], index) => ({
                    label,
                    data: transactionRevenueMixFinancials.map(row => {
                        const total = transactionRevenueKeys.reduce((sum, [transactionKey]) => sum + (row[transactionKey] || 0), 0);
                        return total ? (row[key] || 0) / total * 100 : 0;
                    }),
                    borderColor: chartColors[index % chartColors.length],
                    backgroundColor: chartColor(index),
                    yAxisID: 'y'
                })),
                {
                    label: 'HOOD Stock Price',
                    type: 'line',
                    data: transactionRevenueMixFinancials.map(row => quarterlyStockPrices[row.Quarter] ?? null),
                    borderColor: '#FFFFFF',
                    backgroundColor: 'rgba(255, 255, 255, 0.1)',
                    borderWidth: 3,
                    pointRadius: 3,
                    fill: false,
                    tension: 0.25,
                    yAxisID: 'yPrice'
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
                    title: { display: true, text: 'Quarters' }
                },
                y: {
                    stacked: true,
                    title: { display: true, text: 'Transaction Revenue Mix (%)' },
                    min: 0,
                    max: 100
                },
                yPrice: {
                    type: 'linear',
                    position: 'right',
                    title: { display: true, text: 'HOOD Stock Price ($)' },
                    min: 0,
                    grid: { drawOnChartArea: false }
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
        : selectedCompany === 'Nike'
            ? [
                ['NorthAmericaRevenue', 'North America'],
                ['EMEARevenue', 'EMEA'],
                ['GreaterChinaRevenue', 'Greater China'],
                ['AsiaPacificLatinAmericaRevenue', 'Asia Pacific & Latin America'],
                ['OtherRegionalRevenue', 'Other / Converse']
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
    let selectedNikeRegionIndex = null;

    createChart(revenue_mix_percentage, {
        type: 'bar',
        data: {
            labels: revenueMixPercentageFinancials.map(row => row.Quarter),
            datasets: [
                ...revenueMixKeys.map(([key, label], index) => ({
                    label,
                    data: revenueMixPercentageFinancials.map(row => {
                        const total = revenueMixKeys.reduce((sum, [mixKey]) => sum + (row[mixKey] || 0), 0);
                        return total ? (row[key] || 0) / total * 100 : 0;
                    }),
                    borderColor: chartColors[index % chartColors.length],
                    backgroundColor: chartColor(index)
                })),
                ...(selectedCompany === 'Nike' ? [{
                    label: 'Region Trend',
                    type: 'line',
                    data: [],
                    borderColor: '#FFFFFF',
                    backgroundColor: '#FFFFFF',
                    borderWidth: 3,
                    pointRadius: 2,
                    fill: false,
                    tension: 0.25,
                    yAxisID: 'yTrend',
                    hidden: true
                }] : [])
            ]
        },
        options: withDarkChartDefaults({
            plugins: {
                legend: {
                    display: true,
                    ...(selectedCompany === 'Nike' ? {
                        labels: { filter: item => item.datasetIndex < revenueMixKeys.length },
                        onClick: (_event, item, legend) => {
                            const chart = legend.chart;
                            selectedNikeRegionIndex = selectedNikeRegionIndex === item.datasetIndex ? null : item.datasetIndex;

                            revenueMixKeys.forEach((_, index) => {
                                chart.setDatasetVisibility(index, selectedNikeRegionIndex === null || index === selectedNikeRegionIndex);
                            });

                            const trendIndex = revenueMixKeys.length;
                            const trend = chart.data.datasets[trendIndex];
                            trend.data = selectedNikeRegionIndex === null ? [] : chart.data.datasets[selectedNikeRegionIndex].data;
                            trend.label = selectedNikeRegionIndex === null ? 'Region Trend' : `${revenueMixKeys[selectedNikeRegionIndex][1]} Trend`;
                            chart.setDatasetVisibility(trendIndex, selectedNikeRegionIndex !== null);
                            chart.update();
                        }
                    } : {})
                }
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
                },
                ...(selectedCompany === 'Nike' ? {
                    yTrend: {
                        type: 'linear',
                        display: false,
                        min: 0,
                        max: 100
                    }
                } : {})
            }
        })
    });

    const nikeChannelMixKeys = [
        ['WholesaleRevenue', 'Wholesale'],
        ['DirectToConsumerRevenue', 'DTC']
    ];
    const nikeChannelMixFinancials = filteredFinancialRowsForChart('nikeChannelMix', companyBaseFinancials, financialStartQuarter, financialStartYear).filter(row =>
        nikeChannelMixKeys.some(([key]) => row[key] !== undefined && row[key] !== 0)
    );

    createChart(nike_channel_mix, {
        type: 'bar',
        data: {
            labels: nikeChannelMixFinancials.map(row => row.Quarter),
            datasets: nikeChannelMixKeys.map(([key, label], index) => ({
                label,
                data: nikeChannelMixFinancials.map(row => row[key] || 0),
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

    const nikeChannelMixPercentageFinancials = filteredFinancialRowsForChart('nikeChannelMixPercentage', companyBaseFinancials, financialStartQuarter, financialStartYear).filter(row =>
        nikeChannelMixKeys.some(([key]) => row[key] !== undefined && row[key] !== 0)
    );

    createChart(nike_channel_mix_percentage, {
        type: 'bar',
        data: {
            labels: nikeChannelMixPercentageFinancials.map(row => row.Quarter),
            datasets: nikeChannelMixKeys.map(([key, label], index) => ({
                label,
                data: nikeChannelMixPercentageFinancials.map(row => {
                    const total = nikeChannelMixKeys.reduce((sum, [channelKey]) => sum + (row[channelKey] || 0), 0);
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
                    title: { display: true, text: 'Channel Mix (%)' },
                    min: 0,
                    max: 100
                }
            }
        })
    });

    const nikeProductMixKeys = [
        ['FootwearRevenue', 'Footwear'],
        ['ApparelRevenue', 'Apparel'],
        ['EquipmentRevenue', 'Equipment'],
        ['OtherRevenue', 'Other']
    ];
    const nikeProductMixFinancials = filteredFinancialRowsForChart('nikeProductMix', companyBaseFinancials, financialStartQuarter, financialStartYear).filter(row =>
        nikeProductMixKeys.some(([key]) => row[key] !== undefined && row[key] !== 0)
    );
    const nikeProductMixPercentageFinancials = filteredFinancialRowsForChart('nikeProductMixPercentage', companyBaseFinancials, financialStartQuarter, financialStartYear).filter(row =>
        nikeProductMixKeys.some(([key]) => row[key] !== undefined && row[key] !== 0)
    );

    renderStackedMixChart(nike_product_mix, nikeProductMixFinancials, nikeProductMixKeys, 'Revenue ($M)');
    renderStackedMixChart(nike_product_mix_percentage, nikeProductMixPercentageFinancials, nikeProductMixKeys, 'Product Mix (%)', true);

    const nikeExpenseMixKeys = [
        ['COGS', 'COGS'],
        ['Marketing', 'Marketing'],
        ['GeneralAndAdministrativeExpense', 'G&A']
    ];
    const nikeExpenseMixFinancials = filteredFinancialRowsForChart('nikeExpenseMix', companyBaseFinancials, financialStartQuarter, financialStartYear).filter(row =>
        nikeExpenseMixKeys.some(([key]) => row[key] !== undefined && row[key] !== 0)
    );
    const nikeExpenseMixPercentageFinancials = filteredFinancialRowsForChart('nikeExpenseMixPercentage', companyBaseFinancials, financialStartQuarter, financialStartYear).filter(row =>
        nikeExpenseMixKeys.some(([key]) => row[key] !== undefined && row[key] !== 0)
    );

    renderStackedMixChart(nike_expense_mix, nikeExpenseMixFinancials, nikeExpenseMixKeys, 'Expenses ($M)');
    renderStackedMixChart(nike_expense_mix_percentage, nikeExpenseMixPercentageFinancials, nikeExpenseMixKeys, 'Expense Mix (%)', true);

    const nikeRevenueVsExpensesFinancials = filteredFinancialRowsForChart('nikeRevenueVsExpenses', companyBaseFinancials, financialStartQuarter, financialStartYear).filter(row =>
        row.Revenue !== undefined && row.COGS !== undefined && row.OperatingExpenses !== undefined
    );

    createChart(nike_revenue_vs_expenses, {
        type: 'line',
        data: {
            labels: nikeRevenueVsExpensesFinancials.map(row => row.Quarter),
            datasets: [
                {
                    label: 'Revenue ($M)',
                    data: nikeRevenueVsExpensesFinancials.map(row => row.Revenue),
                    borderColor: '#00C805',
                    backgroundColor: '#00C805',
                    borderWidth: 3,
                    pointRadius: 2,
                    fill: false,
                    tension: 0.3
                },
                {
                    label: 'Total Expenses (COGS + OpEx) ($M)',
                    data: nikeRevenueVsExpensesFinancials.map(row => row.COGS + row.OperatingExpenses),
                    borderColor: '#E45756',
                    backgroundColor: '#E45756',
                    borderWidth: 3,
                    pointRadius: 2,
                    fill: false,
                    tension: 0.3
                }
            ]
        },
        options: withDarkChartDefaults({
            scales: {
                x: { title: { display: true, text: 'Quarters' } },
                y: { title: { display: true, text: 'USD millions' }, min: 0 }
            }
        })
    });

    const netInterestKeys = [
        ['MarginInterestRevenue', 'Margin Interest'],
        ['InterestOnCashRevenue', 'Cash Interest'],
        ['CashSweepRevenue', 'Cash Sweep'],
        ['InterestOnCorporateCashRevenue', 'Corporate Cash'],
        ['InterestOnCreditCardsRevenue', 'Credit Cards'],
        ['SecuritiesLendingRevenue', 'Securities Lending'],
        ['OtherNetInterestRevenue', 'Other Net Interest'],
        ['InterestExpensesRelatedToCreditFacilities', 'Credit Facility Expense']
    ];
    const netInterestBreakdownFinancials = filteredFinancialRowsForChart('netInterestBreakdown', companyBaseFinancials, financialStartQuarter, financialStartYear).filter(row =>
        row.NetInterestRevenue !== undefined &&
        netInterestKeys.some(([key]) => row[key] !== undefined)
    );

    createChart(net_interest_breakdown, {
        type: 'bar',
        data: {
            labels: netInterestBreakdownFinancials.map(row => row.Quarter),
            datasets: netInterestKeys.map(([key, label], index) => ({
                label,
                data: netInterestBreakdownFinancials.map(row => row[key] || 0),
                borderColor: chartColors[index % chartColors.length],
                backgroundColor: chartColor(index)
            }))
        },
        options: withDarkChartDefaults({
            plugins: {
                legend: { display: false }
            },
            scales: {
                x: {
                    stacked: true,
                    title: { display: true, text: 'Quarters' }
                },
                y: {
                    stacked: true,
                    title: { display: true, text: 'Net Interest Revenue ($M)' }
                }
            }
        })
    });

    const netInterestMixFinancials = filteredFinancialRowsForChart('netInterestMixPercentage', companyBaseFinancials, financialStartQuarter, financialStartYear).filter(row =>
        row.NetInterestRevenue !== undefined &&
        netInterestKeys.some(([key]) => row[key] !== undefined)
    );
    const positiveNetInterestKeys = netInterestKeys.filter(([key]) => key !== 'InterestExpensesRelatedToCreditFacilities');

    createChart(net_interest_mix_percentage, {
        type: 'bar',
        data: {
            labels: netInterestMixFinancials.map(row => row.Quarter),
            datasets: positiveNetInterestKeys.map(([key, label], index) => ({
                label,
                data: netInterestMixFinancials.map(row => {
                    const total = positiveNetInterestKeys.reduce((sum, [interestKey]) => sum + (row[interestKey] || 0), 0);
                    return total ? (row[key] || 0) / total * 100 : 0;
                }),
                borderColor: chartColors[index % chartColors.length],
                backgroundColor: chartColor(index)
            }))
        },
        options: withDarkChartDefaults({
            plugins: {
                legend: { display: false }
            },
            scales: {
                x: {
                    stacked: true,
                    title: { display: true, text: 'Quarters' }
                },
                y: {
                    stacked: true,
                    title: { display: true, text: 'Net Interest Mix (%)' },
                    min: 0,
                    max: 100
                }
            }
        })
    });

    const revenuePlatformFinancials = filteredFinancialRowsForChart('revenuePlatformAssets', companyBaseFinancials, financialStartQuarter, financialStartYear).filter(row =>
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

    const cryptoRevenueAssetsFinancials = filteredFinancialRowsForChart('cryptoRevenueAssets', companyBaseFinancials, financialStartQuarter, financialStartYear).filter(row =>
        row.CryptoRevenue !== undefined &&
        row.Cryptocurrencies !== undefined
    );

    createChart(crypto_revenue_assets, {
        type: 'bar',
        data: {
            labels: cryptoRevenueAssetsFinancials.map(row => row.Quarter),
            datasets: [
                {
                    label: 'Crypto Revenue ($M)',
                    data: cryptoRevenueAssetsFinancials.map(row => row.CryptoRevenue),
                    backgroundColor: 'hsla(220, 85%, 45%, 0.7)',
                    borderColor: 'hsl(220, 85%, 45%)',
                    yAxisID: 'yRevenue'
                },
                {
                    label: 'Crypto Assets ($B)',
                    data: cryptoRevenueAssetsFinancials.map(row => row.Cryptocurrencies),
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
                    title: { display: true, text: 'Crypto Revenue ($M)' },
                    min: 0
                },
                yAssets: {
                    type: 'linear',
                    position: 'right',
                    title: { display: true, text: 'Crypto Assets ($B)' },
                    min: 0,
                    grid: { drawOnChartArea: false }
                }
            }
        })
    });

    const platformAssetsPerCustomerFinancials = filteredFinancialRowsForChart('platformAssetsPerCustomer', companyBaseFinancials, financialStartQuarter, financialStartYear).filter(row =>
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

setupChartContainers();
setupRobinhoodSections();
setupChartPeriodControls();
setupCompanyTabs();
setupViewTabs();
loadHomeCompanyCards();
loadRotheraSnapshot().catch(showDashboardError);
updateTopNavigation();
updateCompanyVisibility();
updateViewVisibility();
