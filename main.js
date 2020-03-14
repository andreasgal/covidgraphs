'use strict';

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

function plotxxx(data) {
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

function plot(data, type) {
    console.log(data, type);
}

function preprocess_covid_data(data) {
    // we fetch state data and add a 'all' meta state that aggregates the data across all states
    const result = data.slice();
    unique(data.map(entry => entry.date)).forEach(date => {
        const subset = data.filter(entry => entry.date === date);
        result.push({
            date: date,
            state: 'all',
            positive: sum(subset.map(entry => entry.positive)),
            negative: sum(subset.map(entry => entry.negative)),
            pending: sum(subset.map(entry => entry.pending)),
            death: sum(subset.map(entry => entry.death)),
            total: sum(subset.map(entry => entry.total)),
        });
    });
    // parse date format in the JSON data
    result.forEach(entry => entry.date = parseDate(entry.date));
    // calculate the earliest date in the set
    const start = new Date(Math.min.apply(null, data.map(entry => entry.date)));
    // add a field indicating the day since the start of the data set
    result.forEach(entry => entry.day = days(start, entry.date));
    // sort in order of dates
    return result.sort((a, b) => a.day - b.day);
}

// issue a fetch for the COVID data as soon as the script executes
const covid_data =
      fetch('https://covidtracking.com/api/states/daily')
      .then(response => response.json())
      .then(data => preprocess_covid_data(data))
      .catch((error) => {
          console.log(error);
      });

// once the window is loaded we can process the data
window.onload = () => {
    const ui_state = document.getElementById('state');
    const ui_type = document.getElementById('type');
    covid_data.then(data => {
        // extract list of states from the data, move 'all' to the top,  and set to the default 'all'
        const states = [].concat(['all'], unique(data.map(entry => entry.state)).sort().filter(name => name !== 'all'));
        ui_state.innerHTML =
            states.map(state => '<option value="' + state + '">' + state + '</option>').join('');
        ui_state.value = 'all';
        // refresh handler (also used for the initial paint)
        const refresh = () => {
            const selected_data = data.filter(entry => entry.state === ui_state.value);
            const selected_type = ui_type.value;
            plot(selected_data, selected_type);
        };
        // call refresh if UI settings change
        ui_state.addEventListener('change', () => refresh());
        ui_type.addEventListener('change', () => refresh());
        // initial paint
        refresh();
    });
};
