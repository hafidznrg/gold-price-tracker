/**
 * Registrasi ECharts tree-shaken: hanya grafik garis, komponen yang dipakai, dan renderer
 * canvas. Dimuat dinamis oleh <TimeSeriesChart> sehingga tidak masuk bundle awal halaman.
 */
import { LineChart } from 'echarts/charts';
import {
  DataZoomInsideComponent,
  DataZoomSliderComponent,
  GridComponent,
  MarkAreaComponent,
  MarkLineComponent,
  MarkPointComponent,
  TooltipComponent,
} from 'echarts/components';
import { init, use } from 'echarts/core';
import { CanvasRenderer } from 'echarts/renderers';

use([
  LineChart,
  GridComponent,
  TooltipComponent,
  DataZoomInsideComponent,
  DataZoomSliderComponent,
  MarkAreaComponent,
  MarkLineComponent,
  MarkPointComponent,
  CanvasRenderer,
]);

export { init };
