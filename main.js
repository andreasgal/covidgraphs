'use strict';

function parseDate(date) {
    const year = (date / 10000) | 0;
    date -= year * 10000;
    const month = (date / 100) | 0;
    date -= month * 100;
    const day = date;
    return new Date(Date.UTC(year, month - 1, day, 8, 0, 0));
}

function unique(array) {
    return array.filter((value, index) => array.indexOf(value) === index);
}


function plot(data, state, type, predicted_days) {
    // don't mutate the data we're passed
    data = data.slice();

    // track previous value
    data.forEach((d, i) => d.previous = !i ? d : data[i - 1]);

    // length of the actual data (before prediction)
    const actual_data_length = data.length;

    // fit curve
    let model = d3.regressionExp()(data.map(d => [(d.date - data[0].date) / 86400000, d.value]));

    // predict an additional number of days if requested
    let previous = data[data.length - 1];
    for (let i = 0; i < predicted_days; ++i) {
        data.push({ date: new Date(previous.date.getTime() + 86400000), value: model.predict(data.length) | 0, previous: previous });
        previous = data[data.length - 1];
    }

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
        .call(d3.axisBottom().scale(x).ticks(data.length));

    svg.append('g')
        .style('font', font)
        .attr('transform', `translate(${margin.left}, 0)`)
        .call(d3.axisLeft().scale(y));

    const graph = svg.append('g');

    const line = d3.line()
          .x(d => x(d.date))
          .y(d => y(d.value));

    const plot = svg.append('g')
        .attr('fill', 'none')
        .attr('stroke', 'black')
        .attr('stroke-width', 5)
        .attr('stroke-linecap', 'round');

    plot.selectAll('line')
        .data(data)
        .join('line')
        .attr('x1', (d, i) => x(data[Math.max(i - 1, 0)].date))
        .attr('y1', (d, i) => y(data[Math.max(i - 1, 0)].value))
        .attr('x2', d => x(d.date))
        .attr('y2', d => y(d.value))
        .attr('stroke-dasharray', (d, i) => (i < actual_data_length) ? '0,0' : '7,7');

    graph.append('g')
        .selectAll('circle')
        .data(data)
        .join('circle')
        .attr('fill', 'black')
        .attr('cx', d => x(d.date))
        .attr('cy', d => y(d.value))
        .attr('r', 5);

    graph.append('g')
        .selectAll('text.value')
        .data(data)
        .join('text')
        .attr('class', 'value')
        .filter((d, i) => i > 0)
        .text(d => d.value)
        .attr('font-weight', 'bold')
        .attr('text-anchor', 'end')
        .attr('alignment-baseline', 'after-edge')
        .attr('x', d => x(d.date))
        .attr('y', d => y(d.value) - height / 100);

    graph.append('g')
        .selectAll('text.delta')
        .data(data)
        .join('text')
        .attr('class', 'delta')
        .filter(d => d.previous.value && d.previous.value !== d.value)
        .text((d, i) => (((d.value - d.previous.value) / d.previous.value * 100) | 0) + '%')
        .attr('font-weight', 'lighter')
        .attr('font-size', '14px')
        .attr('fill', d => (d.value > d.previous.value) ? 'red' : 'green')
        .attr('text-anchor', 'end')
        .attr('alignment-baseline', 'after-edge')
        .attr('x', d => (x(d.date) + x(d.previous.date)) / 2)
        .attr('y', d => (y(d.value) + y(d.previous.value)) / 2 - height / 100);
}

function preprocess_covid_data(data) {
    const result = data.slice();
    // parse date format in the JSON data
    result.forEach(d => d.date = parseDate(d.date));
    // calculate the earliest date in the set
    const start = new Date(Math.min.apply(null, data.map(d => d.date)));
    // remove the 'states' field from US data
    result.forEach(d => delete d.states);
    // add psuedo state 'all' for US data
    result.forEach(d => d.state || (d.state = 'all'));
    // sort in order of dates
    return result.sort((a, b) => a.date - b.date);
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
    const ui_predict = document.getElementById('predict');
    fetches.then(datasets => {
        const data = datasets.flat();
        // extract list of states from the data, move 'all' to the top,  and set to the default 'all'
        const states = [].concat(['all'], unique(data.map(d => d.state)).sort().filter(name => name !== 'all'));
        ui_state.innerHTML =
            states.map(state => '<option value="' + state + '" ' + ((state === 'all') ? 'selected' : '') + '>' +
                       state + '</option>').join('');
        // extract types of cases
        const types = Object.keys(data[0]).filter(k => k !== 'date' && k !== 'state');
        ui_type.innerHTML =
            types.map(type => '<option value="' + type + '" ' + ((type === 'positive') ? 'selected' : '') + '>' +
                      ((type !== 'death') ? 'Tested ' + type : 'Deaths') + '</option>').join('');
        // refresh handler (also used for the initial paint)
        const refresh = () => {
            const selected_data = data.filter(d => d.state === ui_state.value);
            const selected_type = ui_type.value;
            plot(selected_data.map(d => ({ date: d.date, value: d[selected_type] })), ui_state.value, selected_type, ui_predict.value);
        };
        // set default values according to parameters
        window.location.hash.substr(1).split('&').map(p => {
            let [key, value] = p.split('=');
            let element = document.getElementById(key);
            if (element) {
                element.value = value;
            }
        });
        // call refresh if UI settings change
        ui_state.addEventListener('change', refresh);
        ui_type.addEventListener('change', refresh);
        ui_predict.addEventListener('change', refresh);
        // also refresh if the window size changes
        window.addEventListener('resize', refresh);
        // initial paint
        refresh();
    });
};
