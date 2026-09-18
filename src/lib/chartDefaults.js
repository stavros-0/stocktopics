export const darkChartDefaults = {
    responsive: true,
    plugins: {
        legend: {
            labels: {
                color: '#FFFFFF'
            }
        }
    },
    scales: {
        x: {
            ticks: { color: '#8E8E8E' },
            grid: { color: '#333' }
        },
        y: {
            ticks: { color: '#8E8E8E' },
            grid: { color: '#333' },
            beginAtZero: true
        }
    }
};

export const chartColors = [
    '#00C805',
    '#1f77b4',
    '#7A8BFF',
    '#E45756',
    '#B279A2',
    '#A3A3A3',
    '#86EFAC',
    '#C084FC',
    '#FACC15'
];

export function chartColor(index, opacity = 'CC') {
    return `${chartColors[index % chartColors.length]}${opacity}`;
}

export function greenLineDataset(label, data) {
    return {
        label, 
        data,
        borderColor: '#00C805',
        backgroundColor: 'rgba(0, 200, 5, 0.1)',
        fill: true,
        tension: 0.3
    };
}

export async function loadJson(path) {
    const response = await fetch(path);
    return response.json();
}

export function getChartContext(id){
    const chart = document.getElementById(id).getContext('2d');
}