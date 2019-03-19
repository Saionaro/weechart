/**
 * TODO
 * * Add dates labels
 * * Floating window
 * * Touch events
 */

const VERBOSE = false;

const DATA_ENDPOINT = "./chart_data.json";
const LINES_COUNT = 6;
const SCALE_RATE = 1;
const MINIMAP_HEIGHT = 75;
const INITIAL_X_SCALE = 5;
const ANIMATION_STEPS = 16;
const DATE_MARGIN = 16;
const HEX_REGEX = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i;
const PIXEL_RATIO = (() => {
  const ctx = document.createElement("canvas").getContext("2d");
  const dpr = window.devicePixelRatio || 1;
  const bsr =
    ctx.webkitBackingStorePixelRatio ||
    ctx.mozBackingStorePixelRatio ||
    ctx.msBackingStorePixelRatio ||
    ctx.oBackingStorePixelRatio ||
    ctx.backingStorePixelRatio ||
    1;
  return dpr / bsr;
})();

let appElement;

const modes = {
  Night: "night",
  Day: "day"
};

const listenerOpts = {
  passive: true
};

const _$TelegramCharts = {
  modeSwitcherData: {
    element: null,
    updateHooks: [],
    captions: {
      [modes.Night]: "Switch to Day Mode",
      [modes.Day]: "Switch to Night Mode"
    },
    mode: modes.Day
  },
  listenersActivated: false,
  mousemoveConsumers: [],
  mouseupConsumers: [],
  onMouseUp: event => {
    const mouseupConsumers = _$TelegramCharts.mouseupConsumers;
    for (let i = 0; i < mouseupConsumers.length; i++) {
      mouseupConsumers[i](event);
    }
  },
  onMouseMove: event => {
    const mousemoveConsumers = _$TelegramCharts.mousemoveConsumers;
    for (let i = 0; i < mousemoveConsumers.length; i++) {
      mousemoveConsumers[i](event);
    }
  },
  activateDragEvents: () => {
    window.document.addEventListener(
      "mousemove",
      _$TelegramCharts.onMouseMove,
      listenerOpts
    );
    window.document.addEventListener(
      "mouseup",
      _$TelegramCharts.onMouseUp,
      listenerOpts
    );
    _$TelegramCharts.listenersActivated = true;
  }
};

const dataTypes = {
  Line: "line",
  Date: "x"
};

const cavasType = {
  Minimap: "minimap",
  Chart: "chart"
};

const extremumType = {
  Local: "local",
  Global: "global"
};

const chartTypesList = [cavasType.Minimap, cavasType.Chart];

const colors = {
  ChartSeparator: {
    day: "#ebf0f3",
    night: "#273545"
  },
  ChartText: {
    day: "#94a2ab",
    night: "#4c6274"
  },
  MinimapBackground: {
    day: "rgba(240, 247, 252, 0.6)",
    night: "rgba(29, 42, 57, 0.8)"
  }
};

const CheckedIcon = `<svg
  class="checked-icon"
  height="20"
  width="20"
  viewBox="0 0 40 40"
>
  <circle
    cx="20"
    cy="20"
    r="17"
    stroke="currentColor"
    stroke-width="3"
    fill="currentColor"
  />
  <polyline
    points="13,22 18,27 27,17"
    stroke-width="4"
    stroke-linejoin="round"
    stroke-linecap="round"
    stroke="white"
    fill="none"
  />
</svg>`;

const hexToRgb = hex => {
  const result = HEX_REGEX.exec(hex);

  if (!result) return null;

  return {
    r: parseInt(result[1], 16),
    g: parseInt(result[2], 16),
    b: parseInt(result[3], 16)
  };
};

const rgbToString = (rgb, alpha = 1) =>
  `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, ${alpha})`;

const isLine = type => type === dataTypes.Line;

const calculateVerticalRatio = (maxValue, height) => {
  if (maxValue > height) {
    return height / maxValue;
  } else {
    const scaledHeight = SCALE_RATE * height;

    if (maxValue < scaledHeight) {
      return scaledHeight / maxValue;
    } else return 1;
  }
};

const calculateHorisontalRatio = (count, width) => width / count;

const setTransform = (style, value) => {
  style.transform = `translateX(${value}px)`;
};

const createHiDPICanvas = (w, h) => {
  const canvas = document.createElement("canvas");
  canvas.width = w * PIXEL_RATIO;
  canvas.height = h * PIXEL_RATIO;
  canvas.style.width = `${w}px`;
  canvas.style.height = `${h}px`;
  canvas.getContext("2d").setTransform(PIXEL_RATIO, 0, 0, PIXEL_RATIO, 0, 0);
  return canvas;
};

const fuzzyAdd = (sum, number) => {
  const result = sum + number;

  if (sum > 0) return result < 0 ? 0 : result;

  return result > 0 ? 0 : result;
};

const createCanvasObject = (type, width, height) => ({
  canvas: createHiDPICanvas(width, height),
  context: null,
  width,
  height,
  type
});

const createDragger = width => {
  const dragger = document.createElement("div");
  dragger.className = "chart__minimap-dragger hide-selection";
  dragger.style.height = `${MINIMAP_HEIGHT - 4}px`;
  dragger.style.width = `${width}px`;

  const arrowLeft = document.createElement("div");
  arrowLeft.className =
    "chart__minimap-dragger-arrow chart__minimap-dragger-arrow--left";
  const arrowRight = document.createElement("div");
  arrowRight.className =
    "chart__minimap-dragger-arrow chart__minimap-dragger-arrow--right";

  dragger.appendChild(arrowLeft);
  dragger.appendChild(arrowRight);

  return dragger;
};

class Chart {
  constructor(container, data, { w, h }) {
    this._data = data;
    this._dataCount = data.columns[0].length - 1;

    this._chart = createCanvasObject(cavasType.Chart, w, h);
    this._chart.height -= DATE_MARGIN;
    this._chart.canvas.className = "chart__chart-canvas";
    this._chart.context = this._chart.canvas.getContext("2d");

    this._minimap = createCanvasObject(cavasType.Minimap, w, MINIMAP_HEIGHT);
    this._minimap.canvas.className = "chart__minimap-canvas";
    this._minimap.context = this._minimap.canvas.getContext("2d");

    this._rgbColors = {};
    this._animations = [];

    this._transitions = {
      [cavasType.Minimap]: {
        yRatioModifer: 0,
        xRatioModifer: 1
      },
      [cavasType.Chart]: {
        yRatioModifer: 0,
        xRatioModifer: INITIAL_X_SCALE
      },
      opacity: {},
      xShift: 0
    };

    for (let column of data.columns) {
      const type = column[0];

      if (isLine(this._data.types[type])) {
        this._rgbColors[type] = hexToRgb(this._data.colors[type]);
        this._transitions.opacity[type] = 1;
      }
    }

    this._container = container;
    this._checkboxContainer = null;
    const dragWidth = w / INITIAL_X_SCALE;
    const viewShift = w - dragWidth;
    this._state = {
      exclude: {},
      drag: {
        active: false,
        resize: false,
        leftArrow: false,
        dragger: null,
        elem: null,
        initialWidth: dragWidth,
        width: dragWidth,
        downX: 0,
        marginLeft: viewShift
      }
    };
    const fragment = document.createDocumentFragment();
    const wrapper = document.createElement("div");
    const dragger = createDragger(dragWidth);
    this._state.drag.dragger = dragger;

    setTransform(dragger.style, viewShift);
    this._transitions.xShift = viewShift / this._minimap.width;

    wrapper.className = "chart__minimap-wrapper";
    wrapper.appendChild(this._minimap.canvas);
    wrapper.appendChild(dragger);
    fragment.appendChild(this._chart.canvas);
    fragment.appendChild(wrapper);
    this._container.appendChild(fragment);

    this._onChangeCheckbox = this._onChangeCheckbox.bind(this);
    this._animationLoop = this._animationLoop.bind(this);
    this._startDrag = this._startDrag.bind(this);
    this._moveDrag = this._moveDrag.bind(this);
    this._endDrag = this._endDrag.bind(this);

    dragger.addEventListener("mousedown", this._startDrag, listenerOpts);

    if (!_$TelegramCharts.listenersActivated) {
      _$TelegramCharts.activateDragEvents();
    }

    _$TelegramCharts.mouseupConsumers.push(this._endDrag);
    _$TelegramCharts.mousemoveConsumers.push(this._moveDrag);
    _$TelegramCharts.modeSwitcherData.updateHooks.push(this._animationLoop);

    this._localExtremums = {
      prev: { min: 0, max: 0 },
      current: { min: 0, max: 0 }
    };

    this._globalExtremums = {
      prev: { min: 0, max: 0 },
      current: { min: 0, max: 0 }
    };

    this._findAllExtremums();
    this._render();
    this._renderButtons();
  }

  _findAllExtremums() {
    this._findExtremums(
      this._localExtremums,
      this._getHorisontalParams(this._chart).window
    );
    this._findExtremums(this._globalExtremums);
  }

  _findExtremums(store, range) {
    const { _data, _state } = this;
    let max = -Infinity;
    let min = Infinity;
    let from = 1;
    let to = _data.columns[0].length;

    if (range) {
      from = range[0] + 1;
      to = range[1] + 1;
    }

    for (let column of _data.columns) {
      const type = column[0];

      if (isLine(_data.types[type]) && !_state.exclude[type]) {
        for (let i = from; i < to; i++) {
          if (column[i] > max) {
            max = column[i];
          }
          if (column[i] < min) {
            min = column[i];
          }
        }
      }
    }

    if (max !== -Infinity) {
      max += min;
    }

    store.prev.min = store.current.min;
    store.prev.max = store.current.max;
    store.current.min = min;
    store.current.max = max;
  }

  _startDrag(event) {
    if (event.which !== 1 || !event.target) return;

    const { drag } = this._state;
    const { classList } = event.target;

    if (classList.contains("chart__minimap-dragger-arrow")) {
      drag.resize = true;

      if (classList.contains("chart__minimap-dragger-arrow--left")) {
        drag.leftArrow = true;
      }
    } else {
      this._state.drag.dragger.classList += " chart__minimap-dragger--dragging";
    }

    drag.elem = event.target;
    drag.downX = event.pageX;
    drag.active = true;
    this._animationLoop();
  }

  _moveDrag({ pageX, movementX }) {
    const { drag } = this._state;

    if (!drag.active) return;

    var moveX = pageX - drag.downX;

    if (Math.abs(moveX) < 4 || movementX === 0) return;

    const maxPadding = this._minimap.width - drag.width;

    if (drag.resize) {
      if (drag.leftArrow) {
        if (
          drag.width - movementX < drag.initialWidth / 2 ||
          drag.marginLeft + movementX < 0
        ) {
          return;
        }

        const newVal = drag.marginLeft + movementX;
        const newShift = newVal / this._minimap.width;
        drag.marginLeft = newVal;
        setTransform(drag.dragger.style, newVal);
        this._transitions.xShift = newShift;

        return this._changeDragWidth(-movementX);
      }

      if (
        drag.width + movementX < drag.initialWidth / 2 ||
        drag.marginLeft + movementX > maxPadding
      ) {
        return;
      }

      return this._changeDragWidth(movementX);
    }

    const sum = drag.marginLeft + movementX;
    const val = sum < 0 ? 0 : sum > maxPadding ? maxPadding : sum;
    setTransform(drag.dragger.style, val);
    drag.marginLeft = val;

    this._transitions.xShift = val / this._minimap.width;
    this._checkYScaleChange();
  }

  _checkYScaleChange() {
    const extremums = this._localExtremums;
    this._findAllExtremums();

    if (
      extremums.prev.max !== extremums.current.max ||
      extremums.prev.min !== extremums.current.min
    ) {
      this._pushAnimation(
        this._animateVertical(this._findVerticalRatioDelta())
      );
    }
  }

  _changeDragWidth(delta) {
    const { [cavasType.Chart]: record } = this._transitions;
    const { drag } = this._state;
    const changedWidth = drag.width + delta;
    const deltaRatio = drag.width / changedWidth;
    drag.width = changedWidth;
    drag.dragger.style.width = `${changedWidth}px`;

    this._pushAnimation(
      this._animateHorisontalScale(
        record.xRatioModifer,
        deltaRatio * record.xRatioModifer
      )
    );
    this._checkYScaleChange();
  }

  _endDrag() {
    const { drag } = this._state;
    drag.elem = null;
    drag.active = false;
    drag.leftArrow = false;
    drag.resize = false;
    drag.downX = 0;
    this._state.drag.dragger.classList = "chart__minimap-dragger";
  }

  _clear(canvas) {
    const context = canvas.getContext("2d");
    context.setTransform(PIXEL_RATIO, 0, 0, PIXEL_RATIO, 0, 0);
    context.clearRect(0, 0, canvas.width, canvas.height);
  }

  _render() {
    this._drawChart();
    this._drawMinimap();
  }

  _drawChart() {
    this._chart.context.lineWidth = 1;
    this._renderAdditionalInfo(this._chart);
    this._chart.context.lineWidth = 2;
    const xParams = this._getHorisontalParams(this._chart);
    this._renderChart(this._chart, xParams);
    this._renderLabels(this._chart, xParams);
  }

  _drawMinimap() {
    const { context, height, width } = this._minimap;
    context.fillStyle =
      colors.MinimapBackground[_$TelegramCharts.modeSwitcherData.mode];
    this._renderChart(this._minimap, this._getHorisontalParams(this._minimap));
    context.fillRect(0, 0, this._state.drag.marginLeft, height);
    context.fillRect(
      this._state.drag.marginLeft + this._state.drag.width,
      0,
      width,
      height
    );
  }

  _renderAdditionalInfo({ context, width, height }) {
    const stepSize = height / LINES_COUNT;

    context.beginPath();
    context.strokeStyle =
      colors.ChartSeparator[_$TelegramCharts.modeSwitcherData.mode];

    for (let i = 0; i < LINES_COUNT; i++) {
      const shift = height - i * stepSize;
      context.moveTo(0, shift - DATE_MARGIN);
      context.lineTo(width, shift - DATE_MARGIN);
    }

    context.stroke();
    context.closePath();
  }

  _renderLabels({ context, height }, { shift }) {
    const { _localExtremums: extremums } = this;
    const stepSize = height / LINES_COUNT;

    context.lineWidth = 1;
    context.fillStyle =
      colors.ChartText[_$TelegramCharts.modeSwitcherData.mode];

    if (extremums.current.max !== -Infinity) {
      for (let i = 0; i < LINES_COUNT; i++) {
        const yShift = height - i * stepSize;
        context.fillText(
          Math.round(extremums.current.max * (i / LINES_COUNT)),
          -shift,
          yShift - 6 - DATE_MARGIN
        );
      }
    }
  }

  _getHorisontalParams({ width, type }) {
    const {
      _transitions: { xShift, [type]: record },
      _dataCount: count
    } = this;
    const xRatio = calculateHorisontalRatio(count, width);
    const scale = xRatio * record.xRatioModifer;

    const params = {
      scale,
      shift: -(count * scale * xShift),
      window: []
    };

    const start = Math.round(-params.shift / params.scale) - 1;
    const end = Math.round((width - params.shift) / params.scale);

    params.window[0] = start < 0 ? 0 : start;
    params.window[1] = end > count ? count : end;

    return params;
  }

  _getVerticalParams({ height, type }) {
    const { _transitions, _localExtremums, _globalExtremums } = this;
    const usedExtremums =
      type === cavasType.Chart ? _localExtremums : _globalExtremums;

    return (
      calculateVerticalRatio(usedExtremums.current.max, height) +
      _transitions[type].yRatioModifer
    );
  }

  _renderChart(canvasParams, { scale, shift }) {
    const { context, width, height, type: canvasType } = canvasParams;
    const {
      _data: data,
      _transitions: { opacity }
    } = this;
    const isChart = canvasType === cavasType.Chart;
    const yScale = this._getVerticalParams(canvasParams);

    if (shift && isChart) {
      context.translate(shift, 0);
    }

    for (let column of data.columns) {
      const type = column[0];
      const opacityValue = opacity[type];

      if (isLine(data.types[type]) && opacityValue !== 0) {
        context.beginPath();
        context.strokeStyle = rgbToString(this._rgbColors[type], opacityValue);
        context.moveTo(0, height - column[1] * yScale);

        for (let i = 2; i < column.length; i++) {
          if (isChart && (i + 1) * scale + shift < 0) {
            continue;
          }

          const x = i * scale;
          let y = height - column[i] * yScale;

          if (isChart) {
            y -= DATE_MARGIN;
          }
          context.lineTo(x, y);

          if (isChart && x + shift > width) break;
        }

        context.stroke();
        context.closePath();
      }
    }
  }

  _renderButtons() {
    let items = "";
    const { _data: data, _container: container } = this;

    for (let type in data.types) {
      if (data.types[type] === dataTypes.Line) {
        items += `<li class="charts-selector__item">
          <label class="checkbox" style="color: ${rgbToString(
            this._rgbColors[type]
          )}">
            <input
              type="checkbox"
              class="checkbox__input visually-hidden"
              name="${type}"
              checked
            >
            ${CheckedIcon}
            <span class="checkbox__title">${data.names[type]}</span>
          </label>
        </li>`;
      }
    }

    const tempContainer = document.createElement("div");
    tempContainer.innerHTML = `<ul class="charts-selector">${items}</ul>`;
    this._checkboxContainer = tempContainer.children[0];
    this._checkboxContainer.addEventListener(
      "change",
      this._onChangeCheckbox,
      listenerOpts
    );
    container.appendChild(this._checkboxContainer);
  }

  _onChangeCheckbox({ target }) {
    this._pushAnimation(this._animateHideChart(target.name, target.checked));
    this._state.exclude[target.name] = !target.checked;
    this._findAllExtremums();
    this._pushAnimation(this._animateVertical(this._findVerticalRatioDelta()));
    this._animationLoop();
  }

  _pushAnimation(animation) {
    this._animations[animation.tag] = animation.hook;
  }

  _findVerticalRatioDelta() {
    const glob = this._globalExtremums;
    const local = this._localExtremums;

    const deltas = {};

    for (const canvasType of chartTypesList) {
      const { height } = this[`_${canvasType}`];
      const isChart = canvasType === cavasType.Chart;
      const extrOld = isChart ? local.prev : glob.prev;
      const extrNew = isChart ? local.current : glob.current;

      deltas[canvasType] =
        calculateVerticalRatio(extrNew.max, height) -
        calculateVerticalRatio(extrOld.max, height);
    }

    return deltas;
  }

  _animateVertical(deltas) {
    const tag = "_animateVertical";
    const steps = {};

    for (let canvasType of chartTypesList) {
      steps[canvasType] = deltas[canvasType] / ANIMATION_STEPS;
      this._transitions[canvasType].yRatioModifer = -deltas[canvasType];
    }

    return {
      hook: () => {
        if (VERBOSE) {
          console.log("animate vertical");
        }

        let finishedAnimations = 0;

        for (let canvasType of chartTypesList) {
          const record = this._transitions[canvasType];
          const yModifer = record.yRatioModifer;

          if (
            (yModifer >= 0 && deltas[canvasType] > 0) ||
            (yModifer <= 0 && deltas[canvasType] < 0) ||
            steps[canvasType] === 0
          ) {
            finishedAnimations++;
          } else {
            record.yRatioModifer = fuzzyAdd(yModifer, steps[canvasType]);
          }
        }

        if (finishedAnimations === chartTypesList.length) {
          delete this._animations[tag];
        }
      },
      tag
    };
  }

  _animateHorisontalScale(oldVal, newVal) {
    const tag = "_animateHorisontalScale";
    const step = (newVal - oldVal) / ANIMATION_STEPS;
    const { [cavasType.Chart]: record } = this._transitions;
    record.xRatioModifer = newVal;

    return {
      hook: () => {
        if (VERBOSE) {
          console.log("animate horisontal scale");
        }
        record.xRatioModifer += step;

        if (
          (step < 0 && record.xRatioModifer <= newVal) ||
          (step > 0 && record.xRatioModifer >= newVal) ||
          step === 0
        ) {
          record.xRatioModifer = newVal;
          delete this._animations[tag];
        }
      },
      tag
    };
  }

  _animateHideChart(type, value) {
    const tag = "_animateHideChart";

    return {
      hook: () => {
        if (VERBOSE) {
          console.log("Hide chart");
        }
        const record = this._transitions.opacity;
        record[type] += value ? 0.08 : -0.08;

        if ((record[type] <= 0 && !value) || (record[type] >= 1 && value)) {
          delete this._animations[tag];
          record[type] = value ? 1 : 0;
        }
      },
      tag
    };
  }

  _animationLoop() {
    if (VERBOSE) {
      console.log("animation tick");
    }

    this._clear(this._chart.canvas);
    this._clear(this._minimap.canvas);

    if (Object.keys(this._animations).length || this._state.drag.active) {
      for (let key in this._animations) {
        this._animations[key]();
      }
      this._render();
      window.requestAnimationFrame(this._animationLoop);
    } else {
      this._render();
    }
  }
}

const onFetchData = data => {
  const fragment = document.createDocumentFragment();

  const w = 800;
  const h = 400;

  for (let i = 0; i < data.length; i++) {
    const chartContainer = document.createElement("div");
    chartContainer.className = "chart";
    new Chart(chartContainer, data[i], { w, h });
    fragment.appendChild(chartContainer);
  }

  appElement.querySelector(".app__charts").appendChild(fragment);
  _$TelegramCharts.modeSwitcherData.element.className = "button mode-switcher";
};

const fetchData = () =>
  fetch(DATA_ENDPOINT)
    .then(data => data.json())
    .catch(console.log);

const switchMode = () => {
  const { modeSwitcherData: data } = _$TelegramCharts;
  const isNight = data.mode === modes.Night;
  const newMode = isNight ? modes.Day : modes.Night;

  data.mode = newMode;
  data.element.innerHTML = data.captions[newMode];
  appElement.classList = isNight ? "app" : "app app--night";

  for (let i = 0; i < data.updateHooks.length; i++) {
    data.updateHooks[i]();
  }
};

const bootUp = () => {
  const switcherData = _$TelegramCharts.modeSwitcherData;
  appElement = document.querySelector(".app");
  fetchData().then(onFetchData);
  switcherData.element = appElement.querySelector(".mode-switcher");
  switcherData.element.addEventListener("click", switchMode, listenerOpts);
};

document.addEventListener("DOMContentLoaded", bootUp);
