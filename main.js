'use strict';

const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => document.querySelectorAll(selector);

const assert = (cond, msg) => {
    if (!cond) {
        throw new Error(msg);
    }
};

function log(msg) {
    $('#log').innerText += Array.prototype.join.call(arguments, ' ') + '\n';
}

async function load() {
    const url = 'https://raw.githubusercontent.com/CSSEGISandData/COVID-19/master/csse_covid_19_data/csse_covid_19_daily_reports/';

    const formatDate = (date) => {
        let s = date.toISOString(); // 2011-10-05T14:48:00.000Z
        return s.substr(5, 2) + '-' + s.substr(8, 2) + '-' + s.substr(0, 4);
    };

    const nextDay = date => {
        date = new Date(date);
        date.setDate(date.getDate() + 1);
        return date;
    };

    const display = (mode, msg) => {
        let e = document.querySelector('#' + mode);
        e.style.display = (!msg ? 'none' : 'block');
        e.innerHTML = msg;
    };

    const us_states = await d3.json('https://covidgraphs.com/us-states.json');

    const parse = (entry) => {
        let country = entry['Country/Region'] || entry['Country_Region'];
        let state = entry['Province/State'] || entry['Province_State'] || '';
        let county = entry['Admin2'] || '';
        let note = '';
        const positive = entry['Confirmed'] || '0';
        const deaths = entry['Deaths'] || '0';
        const recovered = entry['Recovered'] || '0';
        if (country === 'UK') {
            country = 'United Kingdom';
        }
        if (country === 'occupied Palestinian territory') {
            country = 'Palestine';
        }
        if (country === 'Iran (Islamic Republic of)') {
            country = 'Iran';
        }
        if (country.indexOf('(') !== -1 && !state) {
            let parts = country.split(' (');
            country = parts[0];
            state = parts[1].replace(')', '');
        }
        if (country === 'US') {
            if (state.indexOf(',') !== -1) {
                let parts = state.split(', ');
                state = parts[1];
                county = parts[0];
            }
            if (state.indexOf('(') !== -1) {
                let parts = state.split(' (');
                state = parts[0];
                note = parts[1].replace('(', '').replace(')', '');
            }
            state = state.trim();
            if (state === 'US' ||
                state === 'U.S.' ||
                state === 'Unassigned Location' ||
                state === 'Recovered') {
                state = '';
            }
            if (state === 'D.C.') {
                state = 'District of Columbia';
            }
            if (state === 'Wuhan Evacuee' ||
                state === 'Diamond Princess' ||
                state === 'Grand Princess' ||
                state === 'Grand Princess Cruise Ship') {
                note = state;
                state = '';
            }
            if (state.length === 2) {
                state = us_states[state];
                assert(state);
            }
            if (county.indexOf('County')) {
                county = county.replace('County', '').trim();
            }
        }
        return {
            key: [country, state, county],
            positive: positive | 0,
            deaths: deaths | 0,
            recovered: recovered | 0,
        };
    };

    const fetchAllData = async function() {
        const first_date = new Date(Date.UTC(2020, 0, 22)); // 01-22-2020
        const last_date = nextDay(new Date());
        let date = first_date;
        let requests = [];
        display('status', 'Loading data ...');
        do {
            requests.push({ date: date, data: d3.csv(url + formatDate(date) + '.csv').then(csv => csv.map(parse)).catch(e => null) });
            date = nextDay(date);
        } while (date.getTime() <= last_date.getTime());
        const data = (await Promise.all(requests.map(x => x.data))).map((x, i) => ({ date: requests[i].date, data: x }));
        // remove days that failed to fetch
        while (!data[data.length - 1].data)
            data.pop();
        display('status', '');
        return data;
    };

    const setOptions = (element, values, selected) => {
        values = [].concat(['ALL'], values.filter(x => x !== 'ALL').sort());
        element.innerHTML = values.map(key => '<option value="' + key + '"' + '>' +
                                       key.replace(/\|/g, ', ') +
                                       '</a>').join('');
        element.value = selected;
        element.dispatchEvent(new Event('change'));
    };

    fetchAllData().then(dataset => {
        const GLOBAL = -1;
        const COUNTRY = 0;
        const STATE = 1;
        const COUNTY = 2;

        const filterBy = (dataset, n, value) => {
            if (value === 'ALL') {
                return dataset;
            }
            return dataset.map(r => ({ date: r.date, data: r.data.filter(x => x.key[n] === value) }));
        };

        const group = (dataset) => {
            const init = {};
            Object.keys(dataset[dataset.length - 1].data[0]).filter(k => k !== 'key').forEach(k => init[k] = 0);
            const accumulate = (data) => {
                return data.reduce((total, x) => {
                    Object.keys(total).filter(k => k !== 'key').forEach(k => total[k] += x[k]);
                    return total;
                }, Object.assign({}, init));
            };
            return dataset.map(x => ({ date: x.date, data: accumulate(x.data) }));
        };

        const model = (dataset, predict) => {
            const rate = value => {
                const recent = dataset.slice(dataset.length - 3, dataset.length);
                const rate = recent.map(d => d.data[value] / d.previous.data[value]);
                return rate.reduce((total, x) => total + x, 0) / rate.length;
            };
            const positive = rate('positive');
            const deaths = rate('deaths');
            for (let i = 0; i < predict; ++i) {
                let previous = dataset[dataset.length - 1];
                dataset.push({
                    date: nextDay(previous.date),
                    data: {
                        positive: (previous.data.positive * positive) | 0,
                        deaths: (previous.data.deaths * deaths) | 0,
                    },
                    previous: previous,
                    predicted: true,
                });
            }
            return dataset;
        }

        const listKeys = (dataset, n) => {
            return Array.from(new Set(dataset.map(x => x.data).flat().map(x => x.key[n]).filter(x => !!x)).keys());
        };

        const plot = (svg, width, height, datasets, options) => {
            const value = options.value;
            const showrate = options.showrate;
            const logscale = options.logscale;

            // skip over days before the first infection
            datasets = datasets.map(dataset => dataset.filter(d => d.data[value] >= 1));

            // remove datasets that are empty
            datasets = datasets.filter(dataset => dataset.length > 0);

            // if nothing is left to plot, we're done
            if (!datasets.length)
                return;

            const margin = ({top: height / 10, right: width / 15, bottom: height / 8, left: width / 15});

            const x = d3.scaleLinear()
                  .domain([0, Math.max.apply(null, datasets.map(dataset => dataset.length))])
                  .range([margin.left, width - margin.right]);
            const y = (logscale ? d3.scaleLog() : d3.scaleLinear())
                  .domain(d3.extent(datasets.flat().map(d => d.data[value])))
                  .range([height - margin.bottom, margin.top]);

            const font = '14px Helvetica Neue';

            svg.append('g')
                .style('font', font)
                .attr('transform', `translate(0,${height - margin.bottom})`)
                .call(d3.axisBottom().scale(x));

            svg.append('text')
                .attr('x', width / 2)
                .attr('y', height - margin.bottom / 2)
                .style('text-anchor', 'middle')
                .text('Days since start of outbreak');

            svg.append('g')
                .style('font', font)
                .attr('transform', `translate(${margin.left}, 0)`)
                .call(d3.axisLeft().scale(y).ticks(10).tickFormat(d => logscale ? (((Math.log10(d) | 0) === Math.log10(d)) ? d : '') : d));

            const draw = (dataset, color, label) => {
                svg.append('g')
                    .attr('fill', 'none')
                    .attr('stroke', color)
                    .attr('stroke-width', 5)
                    .attr('stroke-linecap', 'round')
                    .selectAll('line')
                    .data(dataset)
                    .join('line')
                    .attr('x1', (d, i) => x(Math.max(i - 1, 0)))
                    .attr('y1', (d, i) => y(dataset[Math.max(i - 1, 0)].data[value]))
                    .attr('x2', (d, i) => x(i))
                    .attr('y2', d => y(d.data[value]))
                    .attr('stroke-dasharray', d => d.predicted ? '7,7' : '0,0');

                svg.append('g')
                    .selectAll('circle')
                    .data(dataset)
                    .join('circle')
                    .attr('fill', 'white')
                    .attr('stroke', color)
                    .attr('stroke-width', 3)
                    .attr('cx', (d, i) => x(i))
                    .attr('cy', d => y(d.data[value]))
                    .attr('r', 5);

                svg.append('g')
                    .selectAll('text.value')
                    .data(dataset)
                    .join('text')
                    .attr('class', 'value')
                    .attr('fill', color)
                    .attr('font-weight', 'bold')
                    .attr('text-anchor', 'end')
                    .attr('alignment-baseline', 'after-edge')
                    .attr('x', (d, i) => x(i))
                    .attr('y', d => y(d.data[value]) - height / 100)
                    .text((d, i) => (!i) ? '' : d.data[value]);

                if (label) {
                    svg.append('text')
                        .attr('class', 'value')
                        .attr('fill', options.color)
                        .attr('font-weight', 'bold')
                        .attr('text-anchor', 'start')
                        .attr('alignment-baseline', 'after-edge')
                        .attr('x', x(dataset.length - 1) + 4)
                        .attr('y', y(dataset[dataset.length - 1].data[value]) - height / 100)
                        .text(d => label);
                }

                if (options.showrate) {
                    svg.append('g')
                        .selectAll('text.delta')
                        .data(dataset)
                        .join('text')
                        .attr('class', 'delta')
                        .attr('font-weight', 'lighter')
                        .attr('font-size', '14px')
                        .attr('fill', 'red')
                        .attr('text-anchor', 'end')
                        .attr('alignment-baseline', 'after-edge')
                        .attr('x', (d, i) => (x(i) + x(i - 1)) / 2)
                        .attr('y', d => (y(d.data[value]) + y(d.previous.data[value])) / 2 - height / 100)
                        .text((d, i) => (!i || d.previous.data[value] === d.data[value]) ? '' : (((d.data[value] - d.previous.data[value]) / d.previous.data[value] * 100) | 0) + '%')
                }
            };

            if (datasets.length === 1) {
                draw(datasets[0], 'black', '(today)');
                return;
            }

            datasets.forEach((dataset, i) => draw(dataset, d3.schemeCategory10[i % 10], ''));
        }

        const select = (dataset, key, predict) => {
            const [country, state, county] = key;

            // filter
            dataset = filterBy(dataset, COUNTRY, country);
            dataset = filterBy(dataset, STATE, state);
            dataset = filterBy(dataset, COUNTY, county);

            // don't mutate original dataset
            dataset = dataset.slice();

            // remove empty records at the beginning
            while (dataset.length && !dataset[0].data.length)
                dataset.shift();

            // remove empty records at the end
            while (dataset.length && !dataset[dataset.length - 1].data.length)
                dataset.pop();

            // Group datasets and eliminate geographic labels
            dataset = group(dataset);

            // sanitize data
            dataset.forEach((d, i) => {
                d.previous = dataset[Math.max(0, i - 1)];
                ['positive', 'deaths'].forEach(k => {
                    d.data[k] = Math.max(d.data[k], d.previous.data[k]);
                });
            });

            // Predict into the future
            dataset = model(dataset, predict);

            return dataset;
        };

        const graph = (datasets, options) => {
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

            svg.append('text')
                .attr('x', width / 2)
		.attr('y', height / 10)
                .attr('text-anchor', 'middle')
		.style('font-size', '24px')
                .text(options.title);

            plot(svg, width, height, datasets, options);
        };

        const title = (key, value) => {
            const [country, state, county] = key;

            let title = 'COVID-19 ' + value;
            if (county !== 'ALL') {
                title += ' (' + county + ')';
            } else if (state !== 'ALL') {
                title += ' (' + state + ')';
            } else if (country !== 'ALL') {
                title += ' (' + country + ')';
            } else {
                title += ' world-wide';
            }

            return title;
        };

        let current = '';
        const maybeUpdate = () => {
            const country = $('#country').value;
            const state = $('#state').value;
            const county = $('#county').value;
            const key = [country, state, county];
            const value = $('#value').value;
            const predict = $('#predict').value;
            const showrate = $('#showrate').checked;
            const logscale = $('#logscale').checked;
            const compare = $('#compare').checked;
            const updated = [].concat(key, [value, predict, showrate, logscale, compare, window.innerWidth, window.innerHeight]).join('|');
            if (current != updated) {
                current = updated;
                const datasets = [select(dataset, key, predict)];
                if (compare) {
                    datasets.push(select(dataset, ['Italy', 'ALL', 'ALL'], predict));
                }
                graph(datasets, {
                    value: value,
                    showrate: showrate,
                    logscale: logscale,
                    compare: compare,
                    title: title(key, value),
                });
            }
        };

        $('#predict').addEventListener('change', (event) => {
            maybeUpdate();
        });

        $('#country').addEventListener('change', (event) => {
            setOptions($('#state'), listKeys(filterBy(dataset, COUNTRY, $('#country').value), STATE), 'ALL');
            if ($('#country').value === 'ALL') {
                $('#state').value = 'ALL';
                $('#county').value = 'ALL';
            }
            maybeUpdate();
        });

        $('#state').addEventListener('change', (event) => {
            setOptions($('#county'), listKeys(filterBy(filterBy(dataset, COUNTRY, $('#country').value), STATE, event.target.value), COUNTY), 'ALL');
            if ($('#state').value === 'ALL') {
                $('#county').value = 'ALL';
            }
            maybeUpdate();
        });

        $$('#county,#value,#showrate,#logscale,#compare').forEach(e => e.addEventListener('change', maybeUpdate));

        window.addEventListener('resize', maybeUpdate);

        setOptions($('#country'), listKeys(dataset, COUNTRY), 'US');
    });
};

document.addEventListener('DOMContentLoaded', load);
