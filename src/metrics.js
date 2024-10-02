const os = require("os");
const config = require("./config");

class MetricBuilder {
  constructor() {
    this.metrics = [];
  }

  addMetric(metricPrefix, metricName, metricValue, labels = {}) {
    const labelsString = Object.entries(labels)
      .map(([key, value]) => `${key}=${value}`)
      .join(",");

    const metric = `${metricPrefix},source=${config.metrics.source},${labelsString} ${metricName}=${metricValue}`;

    this.metrics.push(metric);
  }

  clearMetrics() {
    this.metrics = [];
  }

  toString(separator = "\n") {
    return this.metrics.join(separator);
  }
}

function getCpuUsagePercentage() {
  const cpuUsage = os.loadavg()[0] / os.cpus().length;
  return cpuUsage.toFixed(2) * 100;
}

function getMemoryUsagePercentage() {
  const totalMemory = os.totalmem();
  const freeMemory = os.freemem();
  const usedMemory = totalMemory - freeMemory;
  const memoryUsage = (usedMemory / totalMemory) * 100;
  return memoryUsage.toFixed(2);
}

class Metrics {
  constructor() {
    this.totalRequests = 0;
    this.totalGets = 0;
    this.totalPuts = 0;
    this.totalPosts = 0;
    this.totalDeletes = 0;
    this.totalLatency = 0;
    this.latencies = [];

    this.totalAuthAttempts = 0;
    this.successfulAuthAttempts = 0;
    this.failedAuthAttempts = 0;

    this.totalPizzasSold = 0;
    this.totalRevenue = 0;
    this.totalCreationFailures = 0;
    this.creationLatencies = [];

    this.activeUsersCount = 0;

    this.sendMetricsPeriodically(10000);
  }

  requestTracker(req, res, next) {
    const start = Date.now();

    res.on("finish", () => {
      const duration = Date.now() - start;
      this.totalRequests++;

      switch (req.method) {
        case "GET":
          this.totalGets++;
          break;
        case "PUT":
          this.totalPuts++;
          break;
        case "POST":
          this.totalPosts++;
          break;
        case "DELETE":
          this.totalDeletes++;
          break;
      }

      this.totalLatency += duration;
      this.latencies.push(duration);

      if (req.path.includes("/auth")) {
        this.recordAuthAttempt(res.statusCode === 200);
        if (req.method == "PUT" && res.statusCode == 200) {
          this.activeUsersCount++;
        }
        if (req.method == "DELETE" && res.statusCode == 200) {
          this.activeUsersCount--;
        }
      }

      if (req.path.includes("/order") && req.method === "POST") {
        const { items } = req.body; // Get the items array from the order
        const creationLatency = duration;
        const success = res.statusCode === 200; // Assuming a 200 response indicates success

        items.forEach((item) => {
          const price = item.price; // Get the price of each pizza
          this.recordPizzaSale(price, creationLatency, success);
        });
      }
    });

    next();
  }
  systemMetrics(buf) {
    const cpuUsage = getCpuUsagePercentage();
    const memoryUsage = getMemoryUsagePercentage();

    buf.addMetric("cpu_usage_percentage", cpuUsage);
    buf.addMetric("memory_usage_percentage", memoryUsage);
  }

  authMetrics(buf) {
    buf.addMetric("auth_attempts_total", this.totalAuthAttempts);
    buf.addMetric("auth_attempts_successful", this.successfulAuthAttempts);
    buf.addMetric("auth_attempts_failed", this.failedAuthAttempts);
  }

  httpMetrics(buf) {
    const averageLatency =
      this.latencies.length > 0
        ? (this.totalLatency / this.latencies.length).toFixed(2)
        : 0;

    buf.addMetric("request_total", this.totalRequests);

    buf.addMetric("request_total", this.totalGets, { method: "GET" });
    buf.addMetric("request_total", this.totalPosts, { method: "POST" });
    buf.addMetric("request_total", this.totalDeletes, { method: "DELETE" });

    buf.addMetric("request_latency_average", averageLatency);

    this.latencies = [];
  }

  userMetrics(buf) {
    buf.addMetric("active_users_total", this.activeUsersCount);
  }

  purchaseMetrics(buf) {
    buf.addMetric("pizzas_sold_total", this.totalPizzasSold);
    buf.addMetric("pizzas_sold_minute", this.calculatePizzasSoldPerMinute());
    buf.addMetric("revenue_total", this.totalRevenue);
    buf.addMetric("revenue_minute", this.calculateRevenuePerMinute());
    buf.addMetric(
      "creation_latency_average",
      this.calculateCreationLatencyAverage()
    );
    buf.addMetric("creation_failures_total", this.totalCreationFailures);
  }

  recordAuthAttempt(success) {
    this.totalAuthAttempts++;
    if (success) {
      this.successfulAuthAttempts++;
    } else {
      this.failedAuthAttempts++;
    }
  }
  calculateCreationLatencyAverage() {
    return this.creationLatencies.length > 0
      ? (
          this.creationLatencies.reduce((sum, latency) => sum + latency, 0) /
          this.creationLatencies.length
        ).toFixed(2)
      : 0;
  }

  recordPizzaSale(price, creationLatency, success) {
    this.totalPizzasSold++;
    this.totalRevenue += price;
    if (success) {
      this.creationLatencies.push(creationLatency);
    } else {
      this.totalCreationFailures++;
    }
  }

  sendMetricsPeriodically(period) {
    const timer = setInterval(() => {
      try {
        const buf = new MetricBuilder();
        this.httpMetrics(buf);
        this.systemMetrics(buf);
        this.userMetrics(buf);
        this.purchaseMetrics(buf);
        this.authMetrics(buf);

        const metrics = buf.toString("\n");
        this.sendMetricsToGrafana(metrics);
      } catch (error) {
        console.log("Error sending metrics", error);
      }
    }, period);

    timer.unref();
  }

  sendMetricsToGrafana(metrics) {
    fetch(`${config.metrics.url}`, {
      method: "post",
      body: metrics,
      headers: {
        Authorization: `Bearer ${config.metrics.userId}:${config.metrics.apiKey}`,
      },
    })
      .then((response) => {
        if (!response.ok) {
          console.error("Failed to push metrics data to Grafana");
        } else {
          console.log(`Pushed ${metrics}`);
        }
      })
      .catch((error) => {
        console.error("Error pushing metrics:", error);
      });
  }
}

const metrics = new Metrics();
module.exports = metrics;
