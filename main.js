'use strict';

function parseDate(date) {
    const year = (date / 10000) | 0;
    date -= year * 10000;
    const month = (date / 100) | 0;
    date -= month * 100;
    const day = date;
    return new Date(year, month - 1, day);
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

function plot(data, state, type) {
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

    const margin = ({top: height / 10, right: width / 15, bottom: height / 8, left: width / 15});

    const x = d3.scaleTime()
          .domain(d3.extent(data.map(d => d.date)))
          .range([margin.left, width - margin.right]);
    const y = d3.scaleLinear()
          .domain(d3.extent([].concat([0], data.map(d => d.value))))
          .range([height - margin.bottom, margin.top]);

    svg.append('text')
        .attr('x', width / 2)
        .attr('y', margin.top / 2)
        .attr('text-anchor', 'middle')
        .style('font-size', '24px')
        .text('COVID-19 ' + type + ' tests (' + ((state === 'all') ? 'United States' : state) + ')')

    const font = '14px Helvetica Neue';

    svg.append('g')
        .style('font', font)
        .attr('transform', `translate(0,${height - margin.bottom})`)
        .call(d3.axisBottom().scale(x));

    svg.append('g')
        .style('font', font)
        .attr('transform', `translate(${margin.left}, 0)`)
        .call(d3.axisLeft().scale(y));

    const graph = svg.append('g');

    graph.append('path')
        .datum(data)
        .attr('fill', 'none')
        .attr('stroke', 'red')
        .attr('stroke-width', 5)
        .attr('stroke-linejoin', 'round')
        .attr('stroke-linecap', 'round')
        .attr('d', d3.line()
              .x(d => x(d.date))
              .y(d => y(d.value)));
    graph.selectAll('circle')
        .data(data)
        .enter().append('circle')
        .attr('fill', 'red')
        .attr('r', 5)
        .attr('cx', d => x(d.date))
        .attr('cy', d => y(d.value));
    graph.selectAll('text')
        .data(data)
        .enter().append('text')
        .text(d => d.value)
        .attr('x', d => x(d.date) - width / 40)
        .attr('y', d => y(d.value) - height / 100);
}

function preprocess_covid_data(data) {
    const result = data.slice();
    // parse date format in the JSON data
    result.forEach(d => d.date = parseDate(d.date));
    // calculate the earliest date in the set
    const start = new Date(Math.min.apply(null, data.map(d => d.date)));
    // add a field indicating the day since the start of the data set
    result.forEach(d => d.day = days(start, d.date));
    // remove the 'states' field from US data
    result.forEach(d => delete d.states);
    // add psuedo state 'all' for US data
    result.forEach(d => d.state || (d.state = 'all'));
    // sort in order of dates
    return result.sort((a, b) => a.day - b.day);
}

function load(url) {
    return fetch(url)
        .then(response => response.json())
        .then(data => preprocess_covid_data(data))
        .catch((error) => {
            console.log(error);
        });
}

// Issue a fetch for the COVID data as soon as the script executes
const fetches = Promise.all([load('https://covidtracking.com/api/states/daily'),
                             load('https://covidtracking.com/api/us/daily')])

// once the window is loaded we can process the data
window.onload = () => {
    const ui_state = document.getElementById('state');
    const ui_type = document.getElementById('type');
    fetches.then(datasets => {
        const data = datasets.flat();
        // extract list of states from the data, move 'all' to the top,  and set to the default 'all'
        const states = [].concat(['all'], unique(data.map(d => d.state)).sort().filter(name => name !== 'all'));
        ui_state.innerHTML =
            states.map(state => '<option value="' + state + '" ' + ((state === 'all') ? 'selected' : '') + '>' +
                       state + '</option>').join('');
        // extract types of cases
        const types = Object.keys(data[0]).filter(k => k !== 'date' && k !== 'day' && k !== 'state');
        ui_type.innerHTML =
            types.map(type => '<option value="' + type + '" ' + ((type === 'positive') ? 'selected' : '') + '>' +
                      ((type !== 'death') ? 'Tested ' + type : 'Deaths') + '</option>').join('');
        // refresh handler (also used for the initial paint)
        const refresh = () => {
            const selected_data = data.filter(d => d.state === ui_state.value);
            const selected_type = ui_type.value;
            plot(selected_data.map(d => ({ date: d.date, value: d[selected_type] })), ui_state.value, selected_type);
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
