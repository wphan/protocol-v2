import { MeterProvider, MetricReader } from "@opentelemetry/sdk-metrics-base";
import { PrometheusExporter } from "@opentelemetry/exporter-prometheus";


export class Metrics {
    private meter: any;

    public constructor() {
        this.meter = new MeterProvider()
        const { endpoint, port } = PrometheusExporter.DEFAULT_OPTIONS;
        console.log(`prometheus default endpoint: ${endpoint}`);
        console.log(`prometheus default port: ${port}`);

        const exporter = new PrometheusExporter({}, () => {
            console.log(
              `prometheus scrape endpoint: http://localhost:${port}${endpoint}`,
            );
          });
        this.meter.addMetricReader(new PrometheusExporter({port, endpoint}, () => {

        }))
    }

    public poke() {
        this.meter.addMetricReader()
    }
}