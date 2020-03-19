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

function predict(data, days) {
    // don't mutate the data we're passed
    data = data.slice();

    // track previous value
    data.forEach((d, i) => d.previous = !i ? d : data[i - 1]);

    // fit curve
    let model = d3.regressionExp()(data.filter(d => d.value !== null).map(d => [(d.date - data[0].date) / 86400000, d.value]));

    // predict an additional number of days if requested
    let previous = data[data.length - 1];
    for (let i = 0; i < days; ++i) {
        data.push({ date: new Date(previous.date.getTime() + 86400000), value: model.predict(data.length) | 0, previous: previous, predicted: true });
        previous = data[data.length - 1];
    }

    return data;
}

function plot(data, state, value) {
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
        .text('COVID-19 ' + value + ' (' + ((state === 'all') ? 'United States' : state) + ')')

    const animate = ((selection, duration) => {
        selection.attr('opacity', 0)
            .transition()
            .delay((d, i) => duration + 250 / data.length * i)
            .attr('opacity', 1);
    });

    const font = '14px Helvetica Neue';

    svg.append('g')
        .style('font', font)
        .attr('transform', `translate(0,${height - margin.bottom})`)
                     .call(d3.axisBottom().scale(x).ticks(data.length));

    svg.append('g')
        .style('font', font)
        .attr('transform', `translate(${margin.left}, 0)`)
        .call(d3.axisLeft().scale(y));

    svg.append('g')
        .attr('fill', 'none')
        .attr('stroke', 'black')
        .attr('stroke-width', 5)
        .attr('stroke-linecap', 'round')
        .selectAll('line')
        .data(data)
        .join('line')
        .attr('x1', (d, i) => x(data[Math.max(i - 1, 0)].date))
        .attr('y1', (d, i) => y(data[Math.max(i - 1, 0)].value))
        .attr('x2', d => x(d.date))
        .attr('y2', d => y(d.value))
        .attr('stroke-dasharray', d => d.predicted ? '7,7' : '0,0')
        .call(animate, 0);

    svg.append('g')
        .selectAll('circle')
        .data(data)
        .join('circle')
        .attr('fill', 'black')
        .attr('cx', d => x(d.date))
        .attr('cy', d => y(d.value))
        .attr('r', 5)
        .call(animate, 0);

    svg.append('g')
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
        .attr('y', d => y(d.value) - height / 100)
        .call(animate, 0);

    svg.append('g')
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
        .attr('y', d => (y(d.value) + y(d.previous.value)) / 2 - height / 100)
        .call(animate, 0);
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
    const ui_value = document.getElementById('value');
    const ui_predict = document.getElementById('predict');
    fetches.then(datasets => {
        const data = datasets.flat();
        // extract list of states from the data, move 'all' to the top,  and set to the default 'all'
        const states = [].concat(['all'], unique(data.map(d => d.state)).sort().filter(name => name !== 'all'));
        ui_state.innerHTML =
            states.map(state => '<option value="' + state + '" ' + ((state === 'all') ? 'selected' : '') + '>' +
                       state + '</option>').join('');
        // extract the value to visualize
        const values = Object.keys(data[0]).filter(k => k !== 'date' && k !== 'state');
        ui_value.innerHTML =
            values.filter(value => value !== 'dateChecked').map(value => '<option value="' + value + '" ' + ((value === 'positive') ? 'selected' : '') + '>' +
                                                                ((value !== 'death') ? 'Tested ' + value : 'Deaths') + '</option>').join('');
        // refresh handler (also used for the initial paint)
        const refresh = () => {
            const selected_data = data.filter(d => d.state === ui_state.value);
            const selected_value = ui_value.value;
            const combined_data = predict(selected_data.map(d => ({ date: d.date, value: d[selected_value] })), ui_predict.value);
            plot(combined_data, ui_state.value, selected_value);
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
        document.querySelectorAll('select').forEach(select => select.addEventListener('change', refresh));
        // also refresh if the window size changes
        window.addEventListener('resize', refresh);
        // initial paint
        refresh();
    });
};
