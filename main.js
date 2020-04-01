'use strict';

const $ = (selector) => document.querySelector(selector);

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
        const nextDay = date => {
            date = new Date(date);
            date.setDate(date.getDate() + 1);
            return date;
        };

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

        const listKeys = (dataset, n) => {
            return Array.from(new Set(dataset.map(x => x.data).flat().map(x => x.key[n]).filter(x => !!x)).keys());
        };

        const plot = (svg, width, height, dataset, value, predict) => {
            const actual = dataset.filter(d => !('predicted' in d)).length;

            // return the desired slice of the data
            if (value !== 'positive' && value !== 'deaths')
                predict = 0;
            dataset = dataset.slice(0, actual + (predict * 1));

            const margin = ({top: height / 10, right: width / 15, bottom: height / 8, left: width / 15});

            const x = d3.scaleTime()
                  .domain(d3.extent(dataset.map(d => d.date)))
                  .range([margin.left, width - margin.right]);
            const y = d3.scaleLinear()
                  .domain(d3.extent([].concat([0], dataset.map(d => d.data[value]))))
                  .range([height - margin.bottom, margin.top]);

            const font = '14px Helvetica Neue';

            svg.append('g')
                .style('font', font)
                .attr('transform', `translate(0,${height - margin.bottom})`)
                .call(d3.axisBottom().scale(x));

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
                .data(dataset)
                .join('line')
                .attr('x1', (d, i) => x(dataset[Math.max(i - 1, 0)].date))
                .attr('y1', (d, i) => y(dataset[Math.max(i - 1, 0)].data[value]))
                .attr('x2', d => x(d.date))
                .attr('y2', d => y(d.data[value]))
                .attr('stroke-dasharray', d => d.predicted ? '7,7' : '0,0');

            svg.append('g')
                .selectAll('circle')
                .data(dataset)
                .join('circle')
                .attr('fill', 'black')
                .attr('cx', d => x(d.date))
                .attr('cy', d => y(d.data[value]))
                .attr('r', 5);

            svg.append('g')
                .selectAll('text.value')
                .data(dataset)
                .join('text')
                .attr('class', 'value')
                .filter((d, i) => i > 0)
                .text(d => d.data[value])
                .attr('font-weight', 'bold')
                .attr('text-anchor', 'end')
                .attr('alignment-baseline', 'after-edge')
                .attr('x', d => x(d.date))
                .attr('y', d => y(d.data[value]) - height / 100);

            svg.append('g')
                .selectAll('text.delta')
                .data(dataset)
                .join('text')
                .attr('class', 'delta')
                .filter(d => d.previous.data[value] && d.previous.data[value] !== d.data[value])
                .text((d, i) => (((d.data[value] - d.previous.data[value]) / d.previous.data[value] * 100) | 0) + '%')
                .attr('font-weight', 'lighter')
                .attr('font-size', '14px')
                .attr('fill', d => (d.data[value] > d.previous.data[value]) ? 'red' : 'green')
                .attr('text-anchor', 'end')
                .attr('alignment-baseline', 'after-edge')
                .attr('x', d => (x(d.date) + x(d.previous.date)) / 2)
                .attr('y', d => (y(d.data[value]) + y(d.previous.data[value])) / 2 - height / 100);
        }

        const graph = (dataset, value) => {
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

            plot(svg, width, height, dataset, value, 0);
        };

        const update = (key, dataset, value) => {
            let [country, state, county] = key;

            if (country !== 'ALL') {
                dataset = filterBy(dataset, COUNTRY, country);
            }

            if (state !== 'ALL') {
                dataset = filterBy(dataset, STATE, state);
            }

            if (county !== 'ALL') {
                dataset = filterBy(dataset, COUNTY, county);
            }

            // don't mutate original dataset
            dataset = dataset.slice();

            // remove empty records at the beginning
            while (dataset.length && !dataset[0].data.length)
                dataset.shift();

            // remove empty records at the end
            while (dataset.length && !dataset[dataset.length - 1].data.length)
                dataset.pop();

            dataset = group(dataset);

            // track the previous day's value in previous
            dataset = dataset.map((d, i) => ({ date: d.date, previous: dataset[Math.max(0, i - 1)], data: d.data }));

            // sanitize data
            dataset.forEach(d => {
                ['positive', 'deaths'].forEach(k => {
                    d.data[k] = Math.max(d.data[k], d.previous.data[k]);
                });
            });

            graph(dataset, value);
        };

        let current = '';
        const maybeUpdate = () => {
            const key = [$('#country').value, $('#state').value, $('#county').value];
            const updated = [].concat(key, [$('#value').value]).join('|');
            if (current != updated) {
                current = updated;
                update(key, dataset, $('#value').value);
            }
        };

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

        $('#county').addEventListener('change', maybeUpdate);
        $('#value').addEventListener('change', maybeUpdate);

        window.addEventListener('resize', () => {
            current = '';
            maybeUpdate();
        });

        setOptions($('#country'), listKeys(dataset, COUNTRY), 'US');
    });
};

document.addEventListener('DOMContentLoaded', load);
