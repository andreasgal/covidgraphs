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

function predict(data) {
    const states = unique(data.map(d => d.state));
    return states.map(state => {
        // process each state at a time
        let result = data.filter(d => d.state === state);

        // track previous value
        result.forEach((d, i) => d.previous = !i ? d : result[i - 1]);

        // add predicted entries
        let previous = result[result.length - 1];
        for (let i = 0; i < 42; ++i) {
            let entry = ({ date: new Date(previous.date.getTime() + 86400000), state: state, previous: previous, predicted: true });
            result.push(entry);
            previous = result[result.length - 1];
        }

        // predict for 'positive' and 'death' values
        ['positive', 'death'].forEach(value => {
            // fit curve
            let model = d3.regressionExp()(result.filter(d => d[value] !== null).map(d => [(d.date - result[0].date) / 86400000, d[value]]));

            // predict an additional number of days if requested
            result.forEach((d, i) => {
                if (d.predicted) {
                    d[value] = model.predict(i) | 0;
                }
            });
        });

        return result;
    }).flat();
}

function map(svg, width, height, data, value, date) {
    // filter out the selected date
    data = data.filter(d => d.date.getTime() == date);

    // we consider 25% of the cases in a single state really bad
    const max_value = data.filter(d => d.state === 'all')[0][value];
    const red_value = (max_value / 4) | 0;

    Promise.all(['https://covidgraphs.com/us-states.json', 'https://covidgraphs.com/us-states-map.json']
                .map(url => d3.json(url)))
        .then(results => {
            const [state_abbreviations, geo] = results;
            const states = Object.fromEntries(Object.entries(state_abbreviations).map(x => [x[1].toLowerCase(), x[0]]));

            const projection = d3.geoAlbersUsa()
                  .translate([width/2, height/2])
                  .scale(width * 0.9);
            const path = d3.geoPath().projection(projection);

            const g = svg.append('g');

            g.selectAll('path')
                .data(geo.features)
                .join('path')
                .attr('d', d => path(d))
                .attr('fill', d => {
                    let state = states[d.properties.name.toLowerCase()];
                    let state_data = data.filter(d => d.state === state);
                    let latest_time = Math.max.apply(null, state_data.map(d => d.date.getTime()));
                    let state_latest = state_data.filter(d => d.date.getTime() === latest_time)[0];
                    let color = Math.max(0, Math.min(255, (255 * state_latest[value] / red_value) | 0));
                    return 'rgb(255, ' + (255 - color) + ', 0)';
                })
                .attr('stroke', 'black')
                .attr('stroke-width', 3);
        });
}

function plot(svg, width, height, data, state, value, predict) {
    // focus on the desired state only
    data = data.filter(d => d.state === state);

    const actual = data.filter(d => !('predicted' in d)).length;

    // return the desired slice of the data
    data = data.slice(0, actual + (predict * 1));

    const margin = ({top: height / 10, right: width / 15, bottom: height / 8, left: width / 15});

    const x = d3.scaleTime()
          .domain(d3.extent(data.map(d => d.date)))
          .range([margin.left, width - margin.right]);
    const y = d3.scaleLinear()
          .domain(d3.extent([].concat([0], data.map(d => d[value]))))
          .range([height - margin.bottom, margin.top]);

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
        .attr('y1', (d, i) => y(data[Math.max(i - 1, 0)][value]))
        .attr('x2', d => x(d.date))
        .attr('y2', d => y(d[value]))
        .attr('stroke-dasharray', d => d.predicted ? '7,7' : '0,0');

    svg.append('g')
        .selectAll('circle')
        .data(data)
        .join('circle')
        .attr('fill', 'black')
        .attr('cx', d => x(d.date))
        .attr('cy', d => y(d[value]))
        .attr('r', 5);

    svg.append('g')
        .selectAll('text.value')
        .data(data)
        .join('text')
        .attr('class', 'value')
        .filter((d, i) => i > 0)
        .text(d => d[value])
        .attr('font-weight', 'bold')
        .attr('text-anchor', 'end')
        .attr('alignment-baseline', 'after-edge')
        .attr('x', d => x(d.date))
        .attr('y', d => y(d[value]) - height / 100);

    svg.append('g')
        .selectAll('text.delta')
        .data(data)
        .join('text')
        .attr('class', 'delta')
        .filter(d => d.previous[value] && d.previous[value] !== d[value])
        .text((d, i) => (((d[value] - d.previous[value]) / d.previous[value] * 100) | 0) + '%')
        .attr('font-weight', 'lighter')
        .attr('font-size', '14px')
        .attr('fill', d => (d[value] > d.previous[value]) ? 'red' : 'green')
        .attr('text-anchor', 'end')
        .attr('alignment-baseline', 'after-edge')
        .attr('x', d => (x(d.date) + x(d.previous.date)) / 2)
        .attr('y', d => (y(d[value]) + y(d.previous[value])) / 2 - height / 100);
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

function load_covid(url) {
    return d3.json(url).then(data => preprocess_covid_data(data));
}

// once the window is loaded we can process the data
window.onload = () => {
    // hide the UI until we're ready
    document.querySelectorAll('select, label').forEach(element => element.hidden = true);

    Promise.all([
        load_covid('https://covidtracking.com/api/states/daily'),
        load_covid('https://covidtracking.com/api/us/daily'),
    ]).then(datasets => {
        // predict 31 days out and combine prediction with actual data
        const data = predict(datasets.flat());

        // extract list of states from the data, move 'all' to the top,  and set to the default 'all'
        const states = [].concat(['all'], unique(data.map(d => d.state)).sort().filter(name => name !== 'all'));
        document.getElementById('state').innerHTML =
            states.map(state => '<option value="' + state + '" ' + ((state === 'all') ? 'selected' : '') + '>' +
                       state + '</option>').join('');

        // extract the list of values we can visualize
        const values = Object.keys(data[0]).filter(k => k !== 'date' && k !== 'state');
        document.getElementById('value').innerHTML =
            values.filter(value => value !== 'dateChecked').map(value => '<option value="' + value + '" ' + ((value === 'positive') ? 'selected' : '') + '>' +
                                                                ((value !== 'death') ? 'Tested ' + value : 'Deaths') + '</option>').join('');

        // extract the dates in the data
        const dates = unique(data.map(d => d.date.getTime())).sort();
        const latest = Math.max.apply(null, data.filter(d => !('predicted' in d)).map(d => d.date.getTime()));
        document.getElementById('date').innerHTML =
            dates.map(t => '<option value=' + t + ' ' +
                      ((t === latest) ? 'selected' : '') +
                      '>' + (new Date(t).toLocaleDateString()) +
                      ((t > latest) ? ' (predicted)' : '') +
                      '</option>').join('');

        // refresh handler (also used for the initial paint)
        const refresh = () => {
            // UI handling
            const ui = Object.fromEntries(Array.prototype.map.call(document.querySelectorAll('select'), element => [element.id, element.value]));
            document.querySelectorAll('select, label').forEach(element => element.hidden = false);
            document.querySelectorAll('#state, label[for="state"]').forEach(e => e.hidden = (ui.type === 'map'));
            document.querySelectorAll('#date, label[for="date"]').forEach(e => e.hidden = (ui.type !== 'map'));
            document.querySelectorAll('#predict, label[for="predict"]').forEach(e => e.hidden = (ui.type !== 'plot' || (ui.value !== 'positive' && ui.value !== 'death')));

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

            // add title
            let title = 'COVID-19 ' + ui.value;
            if (ui.type === 'plot') {
                title += ' (' + ((ui.state === 'all') ? 'United States' : state) + ')';
            }
            svg.append('text')
                .attr('x', width / 2)
                .attr('y', height / 10)
                .attr('text-anchor', 'middle')
                .style('font-size', '24px')
                .text(title);

            switch (ui.type) {
            case 'map':
                map(svg, width, height, data, ui.value, ui.date);
                break;
            case 'plot':
                plot(svg, width, height, data, ui.state, ui.value, ui.predict);
                break;
            }
        };

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
