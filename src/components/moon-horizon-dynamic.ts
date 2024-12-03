/* eslint-disable unused-imports/no-unused-imports */
// Lit
import { LitElement, html, CSSResultGroup, TemplateResult, css, PropertyValues } from 'lit';
import { customElement, property, state } from 'lit/decorators.js';

// Custom Card helpers
import { FrontendLocaleData, HomeAssistant, formatDateShort, formatTime } from 'custom-card-helpers';
// Chart.js
import { Chart, ChartData, ChartOptions, Plugin, ScriptableLineSegmentContext } from 'chart.js/auto';
// DateTime
import { DateTime } from 'luxon';
// Local imports
import { CHART_COLOR, CHART_DATA } from '../const';
import { LunarPhaseCard } from '../lunar-phase-card';
import extractColorData from '../utils/extractColorData.js';
import { hexToRgba } from '../utils/helpers';
import { Moon } from '../utils/moon';
// Styles
import styles from '../css/style.css';

@customElement('moon-horizon-dynamic')
export class MoonHorizonDynamic extends LitElement {
  @property({ attribute: false }) public hass!: HomeAssistant;
  @property({ attribute: false }) moon!: Moon;
  @property({ attribute: false }) card!: LunarPhaseCard;
  @property({ type: Number }) cardWidth: number = 0;
  @property({ type: Number }) cardHeight: number = 0;

  @state() public _todayColor: string = '';
  @state() public _nextDayColor: string = '';

  @state() dynamicChart!: Chart;

  protected async firstUpdated(): Promise<void> {
    await new Promise((resolve) => setTimeout(resolve, 0));
    await this.extractColorData();
    this.initChart();
  }

  protected shouldUpdate(_changedProperties: PropertyValues): boolean {
    if (_changedProperties.has('moon')) {
      if (this.dynamicChart) {
        this.dynamicChart.data = this.chartData;
        this.dynamicChart.update('none');
      }
    }
    return true;
  }

  static get styles(): CSSResultGroup {
    return [
      styles,
      css`
        #horizon-dynamic-chart {
          display: block;
          position: relative;
          margin: 0 auto;
          width: 100%;
          height: 100%;
          max-width: 1800px;
          box-sizing: border-box;
          border-radius: inherit;
          overflow: hidden;
        }

        #blur-overlay {
          position: absolute;
          bottom: 0;
          left: 0;
          -webkit-backdrop-filter: blur(4px);
          backdrop-filter: blur(4px);
          background: transparent !important;
          width: 100%;
          height: 100%;
          pointer-events: none;
          overflow: hidden;
          z-index: 1;
          isolation: isolate;
          box-sizing: border-box;
          border-radius: 24px;
          will-change: backdrop-filter;
        }

        #dynamic-chart {
          width: 100% !important;
          height: 100% !important;
          position: relative;
          z-index: 2;
        }
      `,
    ];
  }

  get _locale(): FrontendLocaleData {
    return this.moon.locale;
  }

  get _date(): Date {
    return this.moon._dynamicDate;
  }

  get todayData() {
    return this.moon._dynamicChartData;
  }

  get chartData(): ChartData {
    return this._getChartData();
  }

  get chartOptions(): ChartOptions {
    return this._getChartOptions();
  }

  get chartPlugins(): Plugin[] {
    const nowPosition = this._nowPosition();
    const midnightPositon = this._midnightPosition();
    const timeMarkers = this._timesMarkersPlugin();
    const expandChartArea = this._expandChartArea();
    return [nowPosition, midnightPositon, timeMarkers, expandChartArea];
  }

  private get CSS_COLOR() {
    const cssColors = getComputedStyle(this) as CSSStyleDeclaration;
    const property = (name: string) => cssColors.getPropertyValue(name).trim();
    return {
      PRIMARY_TEXT: property('--lunar-card-label-font-color'),
      SECONDARY_TEXT: property('--secondary-text-color'),
      DEFAULT_PRIMARY_COLOR: property('--primary-color'),
      MOON_LINE_LIGHT: property('--lunar-fill-line-bellow-color'),
      FILL_BELLOW: property('--lunar-fill-bellow-color'),
      fillColor: property('--lunar-fill-color'),
      fillBelowColor: property('--lunar-fill-bellow-color'),
      fillBelowLineColor: property('--lunar-fill-line-bellow-color'),
    };
  }

  private initChart(): void {
    if (this.dynamicChart) {
      this.dynamicChart.destroy();
    }

    const data = this.chartData;
    const options = this.chartOptions;
    const plugins = this.chartPlugins;

    const ctx = this.shadowRoot!.getElementById('dynamic-chart') as HTMLCanvasElement;
    if (!ctx) return;

    this.dynamicChart = new Chart(ctx, {
      type: 'line',
      data: data,
      options: {
        ...options,
      },
      plugins: plugins,
    });
  }

  protected render(): TemplateResult {
    return html`
      <div id="horizon-dynamic-chart">
        <div id="blur-overlay"></div>
        <canvas id="dynamic-chart" width="${this.cardWidth}"></canvas>
      </div>
    `;
  }

  private _getChartData(): ChartData {
    const isBackground = this.card.config.show_background;
    const SHARED_OPTIONS = {
      pointRadius: 0,
      pointHoverRadius: 4,
      pointHoverBackgroundColor: '#fff',
      pointHoverBorderWidth: 2,
      cubicInterpolationMode: 'monotone',
      tension: 0.2,
      borderWidth: 1,
    };
    const { PRIMARY_TEXT, SECONDARY_TEXT, fillBelowColor, fillColor, fillBelowLineColor } = this.CSS_COLOR;
    const BORDER_COLORS = {
      BOLD: isBackground ? CHART_COLOR.MOON_LINE_BOLD : PRIMARY_TEXT,
      LIGHT: isBackground ? fillBelowLineColor : SECONDARY_TEXT,
    };
    const chartData = this.todayData.chartData;
    const labels = chartData.map((data) => formatTime(new Date(data.timeLabel), this._locale));
    const moonData = chartData.map((data) => data.moon);
    const moonDataset = {
      label: 'Moon',
      data: moonData,
      fill: {
        target: { value: 0 }, // Fill area above 0° altitude
        above: fillColor,
        below: fillBelowColor,
      },
      segment: {
        borderColor: (ctx: ScriptableLineSegmentContext) =>
          ctx.p0.parsed.y >= -0.001 && ctx.p1.parsed.y >= -0.001 ? BORDER_COLORS.BOLD : BORDER_COLORS.LIGHT,
        borderWidth: (ctx: ScriptableLineSegmentContext) =>
          ctx.p0.parsed.y >= -0.001 && ctx.p1.parsed.y >= -0.001
            ? CHART_DATA.BORDER_WIDTH_BOLD
            : CHART_DATA.BORDER_WIDTH_LIGHT,
      },
      yAxisID: 'y',
      ...SHARED_OPTIONS,
    };

    return {
      labels,
      datasets: [moonDataset],
    };
  }

  private _getChartOptions(): ChartOptions {
    const elevationLabel = this.card.localize('card.altitude');
    const formatedTitle = (time: number) => {
      const dateStr = formatDateShort(new Date(time), this._locale);
      return `${dateStr}`;
    };
    const chartData = this.todayData.chartData;
    const values = [...Object.values(chartData).map((data) => data.moon)];
    const minMax = {
      suggestedMin: Math.round(Math.min(...values) - 10),
      suggestedMax: Math.round(Math.max(...values) + 30),
    };
    const SHARED_TICKS_Y = {
      ...minMax,
      ticks: {
        display: false,
      },
      border: { display: false },
      grid: { display: false },
      padding: 0,
      z: -10,
    };

    const scales: ChartOptions['scales'] = {};
    scales['x'] = {
      grid: { display: false },
      ticks: {
        display: false,
      },
      border: { display: false },
    };
    scales['y'] = {
      ...SHARED_TICKS_Y,
      position: 'left',
    };

    const layout: ChartOptions['layout'] = {
      autoPadding: false,
      padding: {
        left: -8,
        right: -8,
      },
    };
    const plugins: ChartOptions['plugins'] = {};
    plugins['legend'] = {
      labels: {
        usePointStyle: false,
        boxWidth: 0,
        boxHeight: 0,
        padding: 20,
        color: CHART_COLOR.SECONDARY_TEXT,
        textAlign: 'left',
        font: {
          size: 14,
        },
      },
      position: 'bottom',
      align: 'end',
      display: false,
    };

    plugins['tooltip'] = {
      titleColor: CHART_COLOR.SECONDARY_TEXT,
      displayColors: false,
      padding: 10,
      callbacks: {
        beforeTitle: function (tooltipItem) {
          const time = chartData[tooltipItem[0].dataIndex].timeLabel;
          const formatedDate = formatedTitle(time);
          return formatedDate;
        },
        label: function (tooltipItem) {
          const value = Math.round(tooltipItem.parsed.y);
          return `${elevationLabel}: ${value}°`;
        },
      },
    };

    const options = {} as ChartOptions;
    options.interaction = {
      intersect: false,
      mode: 'index',
      axis: 'xy',
    };
    options.responsive = true;
    options.maintainAspectRatio = false;
    options.resizeDelay = 100;
    options.layout = layout;
    options.scales = scales;
    options.plugins = plugins;

    return options;
  }

  private _nowPosition(): Plugin {
    const chartData = this.todayData.chartData;
    const emoji = this.todayData.moonIllumination.phase.emoji;
    const emojiFontSize = '18px Arial';
    const timeLabels = chartData.map((data) => data.timeLabel);
    const now = this._date;
    const closestTime = timeLabels.reduce((a, b) =>
      Math.abs(b - now.getTime()) < Math.abs(a - now.getTime()) ? b : a
    );

    const index = timeLabels.indexOf(closestTime);
    return {
      id: 'nowLine',
      beforeDatasetsDraw: (chart: Chart) => {
        const now = this._date;
        const closestTime = timeLabels.reduce((a, b) =>
          Math.abs(b - now.getTime()) < Math.abs(a - now.getTime()) ? b : a
        );

        const index = timeLabels.indexOf(closestTime);
        let nowText = `${this.card.localize('card.common.now')} ${formatTime(now, this._locale)} `; // Update the text with current time
        const {
          ctx,
          chartArea: { bottom },
        } = chart;
        const xLabel = chart.scales.x.getPixelForValue(index);
        const yLabel = chart.scales.y.getPixelForValue(chartData[index].moon);
        const lineColor = hexToRgba(CHART_COLOR.STROKE_LINE, 0.7);
        ctx.font = '12px Arial';
        const width = ctx.measureText(nowText).width;

        // Draw the dashed line and label for the current time
        ctx.save();
        ctx.beginPath();
        ctx.strokeStyle = lineColor;
        ctx.setLineDash([2, 4]);
        ctx.lineWidth = 1;
        ctx.moveTo(xLabel, yLabel);
        ctx.lineTo(xLabel, bottom - 25);
        ctx.stroke();

        // Draw the time label below the line
        ctx.font = '12px Arial';
        ctx.fillStyle = CHART_COLOR.SECONDARY_TEXT;
        ctx.fillText(nowText, xLabel - width / 2, bottom - 10);
        ctx.restore();
      },

      afterDatasetsDraw: (chart: Chart) => {
        const dataSet = chart.getDatasetMeta(0);
        const {
          ctx,
          scales: { x, y },
        } = chart;
        if (!dataSet.hidden) {
          ctx.font = emojiFontSize;
          const emojiSize = ctx.measureText(emoji);
          const xPosition = x.getPixelForValue(index) - emojiSize.width / 2;
          const totalHeight = emojiSize.actualBoundingBoxAscent + emojiSize.actualBoundingBoxDescent;
          const yPosition =
            y.getPixelForValue(chartData[index].moon) + emojiSize.actualBoundingBoxAscent - totalHeight / 2;

          ctx.save();
          ctx.font = emojiFontSize;
          ctx.fillStyle = CHART_COLOR.SECONDARY_TEXT;
          ctx.fillText(emoji, xPosition, yPosition);
          ctx.restore();
        }
      },
    };
  }

  private _midnightPosition(): Plugin {
    const { SECONDARY_TEXT } = this.CSS_COLOR;
    const { _todayColor, _nextDayColor } = this;
    const fontSize = '12px Arial';
    const { chartData } = this.todayData;
    const timeLabels = chartData.map((data) => data.timeLabel);
    const now = this._date;

    // Calculate today's and next day's labels and colors
    const dayOffset = now.getHours() <= CHART_DATA.OFFSET_TIME ? 0 : 1;
    const todayMidnight = new Date(now);
    todayMidnight.setHours(0, 0, 0, 0);
    todayMidnight.setDate(now.getDate() + dayOffset);

    const todayLabelDate = new Date(todayMidnight);
    if (dayOffset === 0) todayLabelDate.setDate(todayLabelDate.getDate() - 1);

    const labels = {
      today: formatDateShort(todayLabelDate, this._locale),
      nextDay: formatDateShort(todayMidnight, this._locale),
    };

    const fillColor = {
      today: dayOffset === 0 ? _nextDayColor : _todayColor,
      nextDay: dayOffset === 0 ? _todayColor : _nextDayColor,
    };

    const closestTimeIndex = timeLabels.findIndex(
      (time) =>
        Math.abs(time - todayMidnight.getTime()) ===
        Math.min(...timeLabels.map((t) => Math.abs(t - todayMidnight.getTime())))
    );

    const drawLabels = (ctx: CanvasRenderingContext2D, x: number, y: number) => {
      ctx.save();
      ctx.font = fontSize;
      ctx.fillStyle = SECONDARY_TEXT;

      const todayWidth = ctx.measureText(labels.today).width;
      const todayXAlign = x - todayWidth - 20;
      const arrowOffset = 7;
      const topOffset = 20;

      ctx.fillText(labels.today, todayXAlign, y + topOffset);
      ctx.fillText('→', todayXAlign + arrowOffset + todayWidth, y + topOffset);

      ctx.fillText('←', x + 2, y + topOffset);
      ctx.fillText(labels.nextDay, x + 20, y + topOffset);

      ctx.restore();
    };

    return {
      id: 'midnightLine',
      beforeDraw: (chart: Chart) => {
        const {
          ctx,
          chartArea: { left, right, bottom, top },
        } = chart;

        const midX = chart.scales.x.getPixelForValue(closestTimeIndex);
        const midY = chart.scales.y.getPixelForValue(0);
        const gradientHeight = (bottom - top) * 0.8;

        // Create gradients
        const createGradient = (startX: number, color: string) => {
          const gradient = ctx.createLinearGradient(startX, bottom, startX, bottom - gradientHeight);
          gradient.addColorStop(0, hexToRgba(color, 0.8));
          gradient.addColorStop(0.7, hexToRgba(color, 0.6));
          gradient.addColorStop(1, hexToRgba(color, 0));
          return gradient;
        };

        ctx.save();
        ctx.fillStyle = createGradient(left, fillColor.today);
        ctx.fillRect(left, bottom - gradientHeight, midX - left, gradientHeight);

        ctx.fillStyle = createGradient(midX, fillColor.nextDay);
        ctx.fillRect(midX, bottom - gradientHeight, right - midX, gradientHeight);

        // Draw lines
        const lineColor = hexToRgba(CHART_COLOR.STROKE_LINE, 0.5);
        ctx.strokeStyle = lineColor;
        ctx.lineWidth = 0.5;

        // Vertical line at midnight
        ctx.beginPath();
        ctx.moveTo(midX, top);
        ctx.lineTo(midX, bottom);
        ctx.stroke();

        // Horizontal midline
        ctx.beginPath();
        ctx.moveTo(left, midY);
        ctx.lineTo(right, midY);
        ctx.stroke();

        ctx.restore();
        drawLabels(ctx, midX, top);
      },
    };
  }
  private _timesMarkersPlugin(): Plugin {
    const { SECONDARY_TEXT, PRIMARY_TEXT } = this.CSS_COLOR;
    const fontSize = {
      primary: '0.9rem Arial',
      secondary: '0.8rem Arial',
    };

    const isPast = (time: number): boolean => new Date(time) < this._date;

    const calculateDuration = (time: number): string => {
      const diff = DateTime.fromMillis(time).diffNow();
      return diff.toFormat("h 'hrs,' m 'min'");
    };

    const drawPoint = (
      ctx: CanvasRenderingContext2D,
      x: number,
      y: number,
      color: string,
      label: string,
      lineHeight: number,
      relativeTime: string
    ) => {
      ctx.save();
      ctx.beginPath();
      ctx.fillStyle = color;
      ctx.arc(x, y, 4, 0, 2 * Math.PI);
      ctx.fill();
      ctx.restore();

      ctx.save();
      ctx.strokeStyle = CHART_COLOR.STROKE_LINE;
      ctx.lineWidth = 1;
      ctx.moveTo(x, y + 5);
      ctx.lineTo(x, y + lineHeight);
      ctx.stroke();
      ctx.restore();

      const drawText = (text: string, offsetY: number, size: string) => {
        ctx.font = size;
        const textWidth = ctx.measureText(text).width;
        ctx.fillStyle = color;
        ctx.fillText(text, x - textWidth / 2, y + offsetY + lineHeight);
      };

      drawText(label, 20, fontSize.primary);
      if (relativeTime) drawText(relativeTime, 35, fontSize.secondary);
    };

    const drawMarkers = (
      chart: Chart,
      times: { time: string; index: number; originalTime: number }[],
      lineHeight: number
    ) => {
      const {
        ctx,
        scales: { x, y },
      } = chart;

      times.forEach((time) => {
        const xPos = x.getPixelForValue(time.index);
        const yPos = y.getPixelForValue(0);
        const color = isPast(time.originalTime) ? hexToRgba(SECONDARY_TEXT, 0.5) : hexToRgba(PRIMARY_TEXT, 0.8);
        const relativeTime = isPast(time.originalTime) ? '' : calculateDuration(time.originalTime);
        drawPoint(ctx, xPos, yPos, color, time.time, lineHeight, relativeTime);
      });
    };

    return {
      id: 'timesMarkers',
      afterDatasetDraw: (chart: Chart) => {
        const moonTimes = this.moon.timeData.moon;

        drawMarkers(chart, moonTimes, 20);
      },
    };
  }

  private _expandChartArea = (): Plugin => {
    return {
      id: 'expandChartArea',
      beforeDraw: (chart: Chart) => {
        chart.chartArea.left = 0;
        chart.chartArea.right = chart.width;
        chart.chartArea.top = 0;
        chart.chartArea.bottom = chart.height;
      },

      afterUpdate: (chart: Chart) => {
        chart.chartArea.left = 0;
        chart.chartArea.right = chart.width;
        chart.chartArea.top = 0;
        chart.chartArea.bottom = chart.height;
      },
    };
  };
  async extractColorData(): Promise<void> {
    const custom_background = this.card.config?.custom_background;
    if (!custom_background || !this.card.config.show_background) {
      this._todayColor = CHART_COLOR.TODAY_FILL;
      this._nextDayColor = CHART_COLOR.NEXTDAY_FILL;
      return;
    }

    try {
      [this._todayColor, this._nextDayColor] = await extractColorData(custom_background);
    } catch (error) {
      this._todayColor = CHART_COLOR.TODAY_FILL;
      this._nextDayColor = CHART_COLOR.NEXTDAY_FILL;
    }
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'moon-horizon-dynamic': MoonHorizonDynamic;
  }
}