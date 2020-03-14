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

function plot(data, type) {
    const div = document.getElementById('graph');

    // remove anything we might have drawn before
    d3.select(div).selectAll('*').remove();

    // add an SVG element covering the full size of the div
    const width = div.clientWidth;
    const height = div.clientHeight;
    const svg = d3.select(div)
          .append('svg')
          .attr('width', width)
          .attr('height', height);

    const margin = ({top: 30, right: width / 20, bottom: 60, left: width / 20});

    const x = d3.scaleTime()
          .domain(d3.extent(data.map(d => d.date)))
          .range([margin.left, width - margin.right]);
    const y = d3.scaleLinear()
          .domain(d3.extent([].concat([0], data.map(d => d[type]))))
          .range([height - margin.bottom, margin.top]);

    svg.append('g')
        .attr('transform', `translate(0,${height - margin.bottom})`)
        .call(d3.axisBottom().scale(x));

    svg.append('g')
        .attr('transform', `translate(${margin.left}, 0)`)
        .call(d3.axisLeft().scale(y));

    svg.append('path')
        .datum(data)
        .attr('fill', 'none')
        .attr("stroke", "black")
        .attr("stroke-width", 2.5)
        .attr("stroke-linejoin", "round")
        .attr("stroke-linecap", "round")
        .attr('d', d3.line()
              .x(d => x(d.date))
              .y(d => y(d[type])));
}

function preprocess_covid_data(data) {
    // we fetch state data and add a 'all' meta state that aggregates the data across all states
    const result = data.slice();
    unique(data.map(d => d.date)).forEach(date => {
        const subset = data.filter(d => d.date === date);
        result.push({
            date: date,
            state: 'all',
            positive: sum(subset.map(d => d.positive)),
            negative: sum(subset.map(d => d.negative)),
            pending: sum(subset.map(d => d.pending)),
            death: sum(subset.map(d => d.death)),
            total: sum(subset.map(d => d.total)),
        });
    });
    // parse date format in the JSON data
    result.forEach(d => d.date = parseDate(d.date));
    // calculate the earliest date in the set
    const start = new Date(Math.min.apply(null, data.map(d => d.date)));
    // add a field indicating the day since the start of the data set
    result.forEach(d => d.day = days(start, d.date));
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
        const states = [].concat(['all'], unique(data.map(d => d.state)).sort().filter(name => name !== 'all'));
        ui_state.innerHTML =
            states.map(state => '<option value="' + state + '" ' + ((state === 'all') ? 'selected' : '') + '>' + state + '</option>').join('');
        // refresh handler (also used for the initial paint)
        const refresh = () => {
            const selected_data = data.filter(d => d.state === ui_state.value);
            const selected_type = ui_type.value;
            plot(selected_data, selected_type);
        };
        // call refresh if UI settings change
        ui_state.addEventListener('change', refresh);
        ui_type.addEventListener('change', refresh);
        // also refresh if the window size changes
        window.addEventListener('resize', refresh);
        // initial paint
        refresh();
    });
};
