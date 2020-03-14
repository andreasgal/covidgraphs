'use strict';

const ui_state_selection = document.getElementById('state');
const ui_type_selection = document.getElementById('type');

fetch('https://covidtracking.com/api/states/daily')
    .then(response => response.json())
    .then(data => process(data))
    .catch((error) => {
        console.log(error);
    });

function parseDate(date) {
    const year = (date / 10000) | 0;
    date -= year * 10000;
    const month = (date / 100) | 0;
    date -= month * 100;
    const day = date;
    return new Date(year, month, day);
}

function days(start, stop) {
    return (stop / 1000 - start / 1000) / (3600 * 24);
}

function unique(array) {
    return array.filter((value, index) => array.indexOf(value) === index);
}

function sum(array) {
    return array.reduce((total, value) => total + (value | 0), 0);
}

function plot(data) {
    const type = ui_type_selection.value;
    const layout = {
        title: 'COVID-19 cases since March 4, 2020',
    };
    Plotly.newPlot(document.getElementById('graph'), [{
        x: data.map(entry => entry.day),
        y: data.map(entry => entry[type]),
        mode: 'lines+markers',
        line: {
            color: 'rgb(55, 128, 191)',
            width: 3,
        },
        marker: {
            color: 'rgb(128, 0, 128)',
            size: 8,
        },
    }], layout);
}

let DATA;

function refresh() {
    plot(DATA.filter(entry => entry.state === ui_state_selection.value));
}

function process(data) {
    unique(data.map(entry => entry.date)).forEach(date => {
        const subset = data.filter(entry => entry.date === date);
        data.push({
            date: date,
            state: 'all',
            positive: sum(subset.map(entry => entry.positive)),
            negative: sum(subset.map(entry => entry.negative)),
            pending: sum(subset.map(entry => entry.pending)),
            death: sum(subset.map(entry => entry.death)),
            total: sum(subset.map(entry => entry.total)),
        });
    });
    const states = unique(data.map(entry => entry.state)).sort();
    ui_state_selection.innerHTML =
        states.map(state => '<option value="' + state + '">' + state + '</option>').join('');
    // parse date format in the JSON data
    data.forEach(entry => entry.date = parseDate(entry.date));
    // calculate the earliest date in the set
    const start = new Date(Math.min.apply(null, data.map(entry => entry.date)));
    // add a field indicating the day since the start of the data set
    data.forEach(entry => entry.day = days(start, entry.date));
    // set default display to all US states
    ui_state_selection.value = 'all';
    // if the select box is changed, update the plot
    ui_state_selection.addEventListener('change', (event) => refresh());
    ui_type_selection.addEventListener('change', (event) => refresh());
    DATA = data;
    refresh();
}

