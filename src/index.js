const VERBOSE = true;

const HEIGHT = 400;
const WIDTH = 1200;
const MAX_WIDTH = 1200;
const MAX_HEIGHT = 390;
const LINES_COUNT = 6;
const STEP_SIZE = HEIGHT / LINES_COUNT;

const types = {
  Line: "line",
  Date: "x"
};

const colors = {
  GraphSeparator: "#ebf0f3"
};

let chartSet;

const isLine = type => type === types.Line;

const calculateVerticalRatio = maxValue =>
  maxValue > MAX_HEIGHT ? MAX_HEIGHT / maxValue : 1;

const calculateHorisontalRatio = count => MAX_WIDTH / count;

class Graph {
  constructor(container, data) {
    this._data = data;
    this._canvas = document.createElement("canvas");
    this._canvas.width = 1200;
    this._canvas.height = 400;
    this._context = this._canvas.getContext("2d");
    this._container = container;
    this._checkboxContainer = null;
    this._state = {
      exclude: {}
    };
    this._onChangeCheckbox = this._onChangeCheckbox.bind(this);

    container.appendChild(this._canvas);
    this._renderButtons();
    this.render();
  }

  clear() {
    this._context.clearRect(0, 0, this._canvas.width, this._canvas.height);
  }

  render() {
    const { _context: context, _data: data } = this;
    context.lineWidth = 1;

    const extremums = this._findExtremums(data);
    const verticalRatio = calculateVerticalRatio(extremums.max);
    const horisontalRatio = calculateHorisontalRatio(data.columns[0].length);

    const lowestDot = extremums.min * verticalRatio;
    const highestDot = extremums.max * verticalRatio;
    const paddings = (MAX_HEIGHT - (highestDot - lowestDot)) / 2;
    const delta = lowestDot - paddings;

    if (VERBOSE) {
      console.log("Vertical ratio: " + verticalRatio);
      console.log("Horisontal ratio: " + horisontalRatio);
    }

    context.beginPath();
    context.strokeStyle = colors.GraphSeparator;

    for (let i = 0; i < LINES_COUNT; i++) {
      const shift = HEIGHT - i * STEP_SIZE;
      context.moveTo(0, shift);
      context.lineTo(WIDTH, shift);
    }

    context.stroke();
    context.restore();
    context.closePath();

    context.lineWidth = 2;

    for (let column of data.columns) {
      const type = column[0];

      if (isLine(data.types[type]) && !this._state.exclude[type]) {
        context.strokeStyle = data.colors[type];

        context.beginPath();
        context.moveTo(0, delta + HEIGHT - column[1] * verticalRatio);

        for (let i = 2; i < column.length; i++) {
          context.lineTo(
            i * horisontalRatio,
            delta + HEIGHT - column[i] * verticalRatio
          );
        }

        context.stroke();
        context.restore();
        context.closePath();
      }
    }
  }

  _findExtremums() {
    const { _data: data } = this;
    let max = -Infinity;
    let min = Infinity;

    for (let column of data.columns) {
      const type = column[0];

      if (isLine(data.types[type]) && !this._state.exclude[type]) {
        for (let i = 1; i < column.length; i++) {
          if (column[i] > max) {
            max = column[i];
          }
          if (column[i] < min) {
            min = column[i];
          }
        }
      }
    }

    return { max, min };
  }

  _renderButtons() {
    let items = "";
    const { _data: data, _container: container } = this;

    for (let type in data.types) {
      if (data.types[type] === types.Line) {
        items += `<li class="charts-selector__item">
          <label class="checkbox">
            <input type="checkbox" class="checkbox__input visually-hidden" name="${type}" checked>
            <span class="checkbox__title">${data.names[type]}</span>
          </label>
        </li>`;
      }
    }

    const tempContainer = document.createElement("div");
    tempContainer.innerHTML = `<ul class="charts-selector">${items}</ul>`;
    this._checkboxContainer = tempContainer.children[0];
    this._checkboxContainer.addEventListener("change", this._onChangeCheckbox);
    container.appendChild(this._checkboxContainer);
  }

  _onChangeCheckbox(event) {
    this._state.exclude[event.target.name] = !event.target.checked;
    this.clear();
    this.render();
  }
}

const onFetchData = data => {
  chartSet = data;
  for (let i = 0; i < data.length; i++) {
    new Graph(document.querySelector(`#graph-${i}`), data[i]);
  }
};

const fetchData = () =>
  fetch("./chart_data.json")
    .then(data => data.json())
    .catch(console.log);

const bootUp = () => {
  fetchData().then(onFetchData);
};

document.addEventListener("DOMContentLoaded", bootUp);